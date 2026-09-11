const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

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
      { headers: { Authorization: authHeader } },
    );
    const result = (await response.json().catch(() => ({}))) as {
      items?: Array<{ id: string; amount: number; status: string; created_at: number }>;
      error?: { description?: string };
    };

    if (!response.ok) {
      throw new Error(
        result.error?.description ?? `Razorpay refund lookup failed (${response.status}).`,
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
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      id?: string;
      amount?: number;
      status?: string;
      error?: { description?: string };
    };

    if (!response.ok) {
      throw new Error(
        result.error?.description ?? `Razorpay refund failed (${response.status}).`,
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
