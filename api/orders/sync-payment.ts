import { getSupabaseAdmin } from "../_lib/supabaseAdmin";
import { getPaymentDetails } from "../_lib/razorpay";

export const config = { runtime: "edge" };

type SyncPaymentRequestBody = {
  orderId?: string;
  paymentId?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Handles the "refunded by mistake, customer repaid" scenario: attaches a
 * new Razorpay payment (found by ID, the same way api/orders/sync-shipping.ts
 * attaches a Shiprocket shipment by AWB) to an order whose original payment
 * was refunded. Confirms the payment directly with Razorpay rather than
 * trusting an admin-typed amount, clears the now-superseded refund fields
 * (they described the *old* payment, not this new one), and — if the order
 * had been marked cancelled as part of that refund — reopens it to
 * "processing" so it can actually be fulfilled again.
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
    return json({ error: "Please sign in to update payment details." }, 401);
  }

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (!user) {
    return json({ error: "Please sign in to update payment details." }, 401);
  }

  let payload: SyncPaymentRequestBody;
  try {
    payload = (await request.json()) as SyncPaymentRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const orderId = payload.orderId;
  const paymentId = payload.paymentId?.trim();

  if (!orderId) {
    return json({ error: "orderId is required." }, 400);
  }
  if (!paymentId) {
    return json({ error: "A Razorpay Payment ID is required." }, 400);
  }

  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("id, status, total_amount")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return json({ error: fetchError?.message ?? "Order was not found." }, 400);
  }

  const payment = await getPaymentDetails(paymentId);

  if (!payment.success) {
    return json(
      { error: payment.message ?? "Could not verify this payment with Razorpay." },
      400,
    );
  }

  // "authorized" covers a card payment awaiting capture — everything else
  // short of "captured" means no money has actually settled, so it can't
  // stand in as the order's valid payment.
  if (payment.status !== "captured") {
    return json(
      {
        error: `This payment's status on Razorpay is "${payment.status}", not "captured" — it can't be recorded as a successful payment until it is.`,
      },
      400,
    );
  }

  const amountMismatch =
    payment.amount !== null &&
    Math.abs(round2(payment.amount) - round2(order.total_amount)) >= 0.01;

  const wasCancelled = order.status === "cancelled";

  const updates: Record<string, unknown> = {
    payment_method: "razorpay",
    payment_details: {
      provider: "razorpay",
      provider_order_id: payment.razorpayOrderId,
      provider_payment_id: payment.id,
      // No client-signed checkout happened for this attachment — the
      // payment is instead confirmed directly against Razorpay's API above,
      // which is a stronger guarantee than a signature would be. This
      // sentinel makes that distinction visible in the stored record rather
      // than fabricating a signature that never existed.
      provider_signature: "verified-via-admin-payment-lookup",
      amount: payment.amount,
      currency: payment.currency,
      status: "verified",
      verified_at: new Date().toISOString(),
      method: payment.method,
    },
    // The old refund_status/amount/id described the *previous* payment,
    // which this new one supersedes — leaving them in place would make the
    // order look simultaneously paid and refunded.
    razorpay_refund_id: null,
    refund_status: null,
    refund_amount: null,
    refunded_at: null,
    refund_checked_at: null,
  };

  if (wasCancelled) {
    updates.status = "processing";
    updates.cancellation_reason = null;
  }

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
    payment: {
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      amountMismatch,
    },
    reopened: wasCancelled,
  });
}
