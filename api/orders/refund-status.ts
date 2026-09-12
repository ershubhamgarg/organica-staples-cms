import { getSupabaseAdmin } from "../_lib/supabaseAdmin";
import { getPaymentRefundState } from "../_lib/razorpay";

export const config = { runtime: "edge" };

type RefundStatusRequestBody = {
  orderId?: string;
};

type PaymentDetails = {
  provider?: string;
  provider_payment_id?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Reconciles an order's refund fields against Razorpay's own record —
 * catches a refund issued directly on the Razorpay dashboard (or any other
 * out-of-band way), which this app would otherwise never learn about since
 * it only ever updates refund_status/refund_amount when *it* issues a
 * refund (via cancel.ts or refund.ts). Called automatically whenever
 * OrderDetails.tsx loads.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const { client: supabaseAdmin, missing } = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return json(
      { error: `Server is missing Supabase configuration: ${missing.join(", ")}` },
      500,
    );
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!bearerToken) {
    return json({ error: "Please sign in to check refund status." }, 401);
  }

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (!user) {
    return json({ error: "Please sign in to check refund status." }, 401);
  }

  let payload: RefundStatusRequestBody;
  try {
    payload = (await request.json()) as RefundStatusRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const orderId = payload.orderId;
  if (!orderId) {
    return json({ error: "orderId is required." }, 400);
  }

  // Selects the full row (not just the refund-related columns this endpoint
  // cares about) because three of the four response branches below return
  // this same `order` object as-is — the client's store action replaces the
  // order's entire entry in its global list with whatever `order` comes
  // back, so a partial row here would silently truncate that order
  // everywhere else it's displayed (e.g. Orders.tsx crashing on a missing
  // `items` array the moment it's rendered from the corrupted store state).
  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return json({ error: fetchError?.message ?? "Order was not found." }, 400);
  }

  const paymentDetails = order.payment_details as PaymentDetails | null;
  if (order.payment_method !== "razorpay" || !paymentDetails?.provider_payment_id) {
    return json({ order, refund: { attempted: false, changed: false } });
  }

  const refundState = await getPaymentRefundState(paymentDetails.provider_payment_id);

  if (!refundState.success) {
    // Non-fatal — this is a silent background check, not a user-initiated
    // action, so a Razorpay hiccup shouldn't surface as an error on the page.
    return json({ order, refund: { attempted: true, changed: false, message: refundState.message } });
  }

  const previousAmount = order.refund_amount ?? 0;
  const nextAmount = refundState.hasAnyRefund ? round2(refundState.amount ?? 0) : 0;

  // Razorpay has no "un-refund" operation, so it reporting *less* refunded
  // than what's already on record is far more likely to mean this check ran
  // against the wrong Razorpay account/mode (e.g. a stale test-mode key
  // somewhere while the real payment is live-mode) than a genuine reversal —
  // refuse to regress the stored amount. This previously let a single
  // wrong-credentialed check silently wipe out a correctly-recorded refund.
  if (nextAmount < previousAmount) {
    return json({
      order,
      refund: {
        attempted: true,
        changed: false,
        message:
          "Razorpay reported a lower refunded amount than already on record — ignored as a likely credential/mode mismatch rather than applied.",
      },
    });
  }

  const changed =
    nextAmount !== previousAmount ||
    (refundState.status ?? null) !== (order.refund_status ?? null) ||
    (refundState.refundId ?? null) !== (order.razorpay_refund_id ?? null);

  if (!changed) {
    return json({ order, refund: { attempted: true, changed: false } });
  }

  const updates = {
    razorpay_refund_id: refundState.refundId,
    refund_status: refundState.status,
    refund_amount: refundState.hasAnyRefund ? nextAmount : null,
    refunded_at: refundState.refundedAt,
    refund_checked_at: new Date().toISOString(),
  };

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from("orders")
    .update(updates)
    .eq("id", orderId)
    .select()
    .single();

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  return json({
    order: updatedOrder,
    refund: {
      attempted: true,
      changed: true,
      previousAmount,
      amount: nextAmount,
      status: refundState.status,
    },
  });
}
