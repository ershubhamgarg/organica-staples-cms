const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

// The Edge runtime's fetch doesn't send a User-Agent (and Razorpay's front
// door has been observed to reject some edge-originated requests with a bare,
// bodyless 406 that a normal browser/curl request with the exact same
// credentials and URL does not reproduce) — set headers that look like an
// ordinary API client rather than an unidentified script, as cheap,
// low-risk hardening against that class of rejection.
const RAZORPAY_REQUEST_HEADERS = {
  "User-Agent": "annvriksh-cms/1.0 (+https://annvriksh.com)",
  Accept: "application/json",
} as const;

/**
 * Razorpay (or a proxy/WAF in front of it) doesn't always return the
 * documented `{error: {description}}` JSON shape — a raw HTTP-level
 * rejection (e.g. a 406) can come back as plain text or an empty body. The
 * previous version of these helpers silently discarded that body on parse
 * failure and fell back to a bare "(status code)" message with zero
 * diagnostic detail, which is exactly what surfaced when a partial refund
 * failed with a 406 and nothing else. Read the body as text first — always
 * capturing something to show, even when it isn't the expected JSON shape.
 */
async function readRazorpayResponse(
  response: Response,
): Promise<{ result: { error?: { description?: string } }; raw: string }> {
  const raw = await response.text().catch(() => "");
  let result: { error?: { description?: string } } = {};
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      // Not JSON — `raw` itself is still surfaced below.
    }
  }
  return { result, raw };
}

function razorpayErrorMessage(
  result: { error?: { description?: string } },
  raw: string,
  status: number,
  action: string,
): string {
  if (result.error?.description) return result.error.description;
  if (raw.trim()) return `${action} (${status}): ${raw.slice(0, 300)}`;
  return `${action} (${status}).`;
}

export type PaymentDetailsLookup = {
  attempted: boolean;
  success: boolean;
  message: string | null;
  id: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  method: string | null;
  razorpayOrderId: string | null;
  createdAt: string | null;
};

/**
 * Looks up a single payment directly by ID — used to attach a repayment to
 * an order after a mistaken refund (see api/orders/sync-payment.ts). Unlike
 * the original checkout flow (which trusts a client-supplied signature),
 * this confirms the payment directly with Razorpay, which is the stronger
 * guarantee.
 */
export async function getPaymentDetails(
  paymentId: string,
): Promise<PaymentDetailsLookup> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return {
      attempted: true,
      success: false,
      message: "Razorpay credentials are not configured.",
      id: null,
      status: null,
      amount: null,
      currency: null,
      method: null,
      razorpayOrderId: null,
      createdAt: null,
    };
  }

  try {
    const authHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
    const response = await fetch(
      `${RAZORPAY_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
      { headers: { ...RAZORPAY_REQUEST_HEADERS, Authorization: authHeader } },
    );
    const { result: parsed, raw } = await readRazorpayResponse(response);
    const result = parsed as {
      id?: string;
      status?: string;
      amount?: number;
      currency?: string;
      method?: string;
      order_id?: string;
      created_at?: number;
      error?: { description?: string };
    };

    if (!response.ok) {
      throw new Error(
        razorpayErrorMessage(result, raw, response.status, "Razorpay payment lookup failed"),
      );
    }

    return {
      attempted: true,
      success: true,
      message: null,
      id: result.id ?? null,
      status: result.status ?? null,
      amount: typeof result.amount === "number" ? result.amount / 100 : null,
      currency: result.currency ?? null,
      method: result.method ?? null,
      razorpayOrderId: result.order_id ?? null,
      createdAt: result.created_at
        ? new Date(result.created_at * 1000).toISOString()
        : null,
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      message: error instanceof Error ? error.message : "Razorpay payment lookup failed.",
      id: null,
      status: null,
      amount: null,
      currency: null,
      method: null,
      razorpayOrderId: null,
      createdAt: null,
    };
  }
}

export type PaymentRefundState = {
  attempted: boolean;
  success: boolean;
  message: string | null;
  hasAnyRefund: boolean;
  refundId: string | null;
  status: string | null;
  /** Cumulative amount refunded so far on this payment, in rupees — the sum
   * of every refund Razorpay has on record for it, regardless of whether it
   * was issued from this app or directly on the Razorpay dashboard. */
  amount: number | null;
  refundedAt: string | null;
};

/**
 * The authoritative refund state of a payment, straight from Razorpay —
 * used to reconcile a refund issued outside this app (e.g. directly on the
 * Razorpay dashboard) back into the order record, which would otherwise
 * never learn about it. Lists every refund on the payment
 * (GET /payments/:id/refunds) rather than trusting our own bookkeeping.
 */
export async function getPaymentRefundState(
  paymentId: string,
): Promise<PaymentRefundState> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return {
      attempted: true,
      success: false,
      message: "Razorpay credentials are not configured.",
      hasAnyRefund: false,
      refundId: null,
      status: null,
      amount: null,
      refundedAt: null,
    };
  }

  try {
    const authHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
    const response = await fetch(
      `${RAZORPAY_API_BASE}/payments/${encodeURIComponent(paymentId)}/refunds`,
      { headers: { ...RAZORPAY_REQUEST_HEADERS, Authorization: authHeader } },
    );
    const { result: parsed, raw } = await readRazorpayResponse(response);
    const result = parsed as {
      items?: Array<{ id: string; amount: number; status: string; created_at: number }>;
      error?: { description?: string };
    };

    if (!response.ok) {
      throw new Error(
        razorpayErrorMessage(result, raw, response.status, "Razorpay refund lookup failed"),
      );
    }

    const items = result.items ?? [];
    // Razorpay's refund list is newest-first, so items[0] is the latest
    // refund event — used for the single refundId/status/timestamp fields
    // the order record keeps — while the cumulative amount sums every item,
    // since several partial refunds (ours and/or dashboard-issued) can
    // exist on the same payment.
    const latest = items[0] ?? null;
    const cumulativeAmount = items.reduce((sum, item) => sum + item.amount, 0) / 100;
    const status = latest
      ? latest.status === "processed"
        ? "processed"
        : latest.status === "failed"
          ? "failed"
          : "pending"
      : null;

    return {
      attempted: true,
      success: true,
      message: null,
      hasAnyRefund: items.length > 0,
      refundId: latest?.id ?? null,
      status,
      amount: items.length > 0 ? cumulativeAmount : null,
      refundedAt:
        latest && status === "processed"
          ? new Date(latest.created_at * 1000).toISOString()
          : null,
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      message: error instanceof Error ? error.message : "Razorpay refund lookup failed.",
      hasAnyRefund: false,
      refundId: null,
      status: null,
      amount: null,
      refundedAt: null,
    };
  }
}

export type SingleRefundLookup = {
  attempted: boolean;
  success: boolean;
  message: string | null;
  id: string | null;
  paymentId: string | null;
  amount: number | null;
  status: string | null;
  refundedAt: string | null;
};

/**
 * Looks up one specific refund by ID — used when an admin manually types in
 * a Razorpay Refund ID (e.g. copied from the Razorpay dashboard after
 * issuing a refund there directly) rather than waiting for/triggering the
 * "Refresh" reconciliation. This is a *confirmation* step: the caller
 * checks the returned `paymentId` actually matches the order's own payment
 * before trusting it, since nothing stops an admin pasting a refund ID that
 * belongs to a completely different payment.
 */
export async function getRefundById(refundId: string): Promise<SingleRefundLookup> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return {
      attempted: true,
      success: false,
      message: "Razorpay credentials are not configured.",
      id: null,
      paymentId: null,
      amount: null,
      status: null,
      refundedAt: null,
    };
  }

  try {
    const authHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
    const response = await fetch(
      `${RAZORPAY_API_BASE}/refunds/${encodeURIComponent(refundId)}`,
      { headers: { ...RAZORPAY_REQUEST_HEADERS, Authorization: authHeader } },
    );
    const { result: parsed, raw } = await readRazorpayResponse(response);
    const result = parsed as {
      id?: string;
      payment_id?: string;
      amount?: number;
      status?: string;
      created_at?: number;
      error?: { description?: string };
    };

    if (!response.ok) {
      throw new Error(
        razorpayErrorMessage(result, raw, response.status, "Razorpay refund lookup failed"),
      );
    }

    const status = result.status === "processed" ? "processed" : "pending";

    return {
      attempted: true,
      success: true,
      message: null,
      id: result.id ?? null,
      paymentId: result.payment_id ?? null,
      amount: typeof result.amount === "number" ? result.amount / 100 : null,
      status,
      refundedAt:
        status === "processed" && result.created_at
          ? new Date(result.created_at * 1000).toISOString()
          : null,
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      message: error instanceof Error ? error.message : "Razorpay refund lookup failed.",
      id: null,
      paymentId: null,
      amount: null,
      status: null,
      refundedAt: null,
    };
  }
}

export type RazorpayRefundResult = {
  attempted: boolean;
  success: boolean;
  message: string | null;
  status: string | null;
  amount: number | null;
  refundId: string | null;
};

/**
 * Issues a refund (full or partial, in rupees) against a captured Razorpay
 * payment. Shared by api/orders/cancel.ts (refund bundled with cancellation)
 * and api/orders/refund.ts (standalone refund, independent of order status).
 */
export async function refundRazorpayPayment(
  paymentId: string,
  reason: string,
  amountRupees: number | undefined,
  notes: Record<string, string> = {},
): Promise<RazorpayRefundResult> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return {
      attempted: true,
      success: false,
      message: "Razorpay credentials are not configured.",
      status: null,
      amount: null,
      refundId: null,
    };
  }

  try {
    const body: Record<string, unknown> = {
      notes: { reason, ...notes },
    };
    if (typeof amountRupees === "number") {
      body.amount = Math.round(amountRupees * 100);
    }

    const authHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
    const response = await fetch(
      `${RAZORPAY_API_BASE}/payments/${encodeURIComponent(paymentId)}/refund`,
      {
        method: "POST",
        headers: {
          ...RAZORPAY_REQUEST_HEADERS,
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      },
    );
    const { result: parsed, raw } = await readRazorpayResponse(response);
    const result = parsed as {
      id?: string;
      amount?: number;
      status?: string;
      error?: { description?: string };
    };

    if (!response.ok) {
      throw new Error(
        razorpayErrorMessage(result, raw, response.status, "Razorpay refund failed"),
      );
    }

    const status = result.status === "processed" ? "processed" : "pending";

    return {
      attempted: true,
      success: true,
      message: `Refund ${status}.`,
      status,
      amount: typeof result.amount === "number" ? result.amount / 100 : null,
      refundId: result.id ?? null,
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      message: error instanceof Error ? error.message : "Razorpay refund failed.",
      status: "failed",
      amount: null,
      refundId: null,
    };
  }
}
