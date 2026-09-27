import { getSupabaseAdmin } from "../_lib/supabaseAdmin";
import { refundRazorpayPayment } from "../_lib/razorpay";

export const config = { runtime: "edge" };

type RefundMode = "full" | "partial";

type RefundRequestBody = {
  orderId?: string;
  reason?: string;
  mode?: RefundMode;
  amount?: number;
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

/**
 * A standalone Razorpay refund, independent of order cancellation —
 * api/orders/cancel.ts only ever refunds as part of cancelling an order (and
 * refuses to run at all once an order is already cancelled), so there was no
 * way to refund a delivered order (a return), retry a refund that failed the
 * first time, or issue a second partial refund. This fills that gap: any
 * order paid via Razorpay can be refunded here regardless of its status, up
 * to whatever hasn't already been refunded.
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
    return json({ error: "Please sign in to issue refunds." }, 401);
  }

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (!user) {
    return json({ error: "Please sign in to issue refunds." }, 401);
  }

  let payload: RefundRequestBody;
  try {
    payload = (await request.json()) as RefundRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const orderId = payload.orderId;
  const reason = payload.reason?.trim();
  const mode: RefundMode = payload.mode === "partial" ? "partial" : "full";
  const amountInput = payload.amount;

  if (!orderId) {
    return json({ error: "orderId is required." }, 400);
  }
  if (!reason) {
    return json({ error: "A refund reason is required." }, 400);
  }

  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("id, total_amount, payment_method, payment_details, refund_amount")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return json({ error: fetchError?.message ?? "Order was not found." }, 400);
  }

  const paymentDetails = order.payment_details as PaymentDetails | null;
  if (
    order.payment_method !== "razorpay" ||
    !paymentDetails?.provider_payment_id
  ) {
    return json(
      { error: "This order was not paid via Razorpay and cannot be refunded here." },
      400,
    );
  }

  const alreadyRefunded = order.refund_amount ?? 0;
  const refundableBalance = order.total_amount - alreadyRefunded;

  if (refundableBalance <= 0) {
    return json({ error: "This order has already been fully refunded." }, 400);
  }

  if (mode === "partial") {
    if (
      typeof amountInput !== "number" ||
      !(amountInput > 0) ||
      amountInput > refundableBalance
    ) {
      return json(
        {
          error: `Refund amount must be greater than 0 and no more than ₹${refundableBalance.toFixed(2)}.`,
        },
        400,
      );
    }
  }

  const refund = await refundRazorpayPayment(
    paymentDetails.provider_payment_id,
    reason,
    mode === "partial" ? amountInput : undefined,
    { refunded_by: "admin_cms" },
  );

  if (!refund.success) {
    return json({ error: refund.message ?? "Refund failed." }, 502);
  }

  const updates = {
    razorpay_refund_id: refund.refundId,
    refund_status: refund.status,
    refund_amount: alreadyRefunded + (refund.amount ?? 0),
    refunded_at: new Date().toISOString(),
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

  return json({ order: updatedOrder, refund });
}
