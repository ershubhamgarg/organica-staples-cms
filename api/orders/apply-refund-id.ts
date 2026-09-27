import { getSupabaseAdmin } from "../_lib/supabaseAdmin";
import { getRefundById } from "../_lib/razorpay";
import { reconcileOrderRefund } from "../_lib/refundReconciliation";

export const config = { runtime: "edge" };

type ApplyRefundIdRequestBody = {
  orderId?: string;
  refundId?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * For a refund issued directly on the Razorpay dashboard: rather than
 * waiting for (or triggering) the general "Refresh" reconciliation, the
 * admin can paste the specific Refund ID from Razorpay's dashboard. This
 * only ever acts as a *confirmation* step — it looks the ID up, checks it
 * genuinely belongs to this order's payment (nothing stops an admin pasting
 * a refund ID that belongs to a completely different payment/order by
 * mistake), and then runs the exact same reconcileOrderRefund used
 * everywhere else, rather than trusting the pasted ID's amount/status
 * directly.
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
    return json({ error: "Please sign in to apply a refund." }, 401);
  }

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (!user) {
    return json({ error: "Please sign in to apply a refund." }, 401);
  }

  let payload: ApplyRefundIdRequestBody;
  try {
    payload = (await request.json()) as ApplyRefundIdRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const orderId = payload.orderId;
  const refundId = payload.refundId?.trim();

  if (!orderId) {
    return json({ error: "orderId is required." }, 400);
  }
  if (!refundId) {
    return json({ error: "A Razorpay Refund ID is required." }, 400);
  }

  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return json({ error: fetchError?.message ?? "Order was not found." }, 400);
  }

  const paymentDetails = order.payment_details as { provider_payment_id?: string } | null;
  if (order.payment_method !== "razorpay" || !paymentDetails?.provider_payment_id) {
    return json(
      { error: "This order was not paid via Razorpay — there's nothing to reconcile." },
      400,
    );
  }

  const refundLookup = await getRefundById(refundId);

  if (!refundLookup.success) {
    return json(
      { error: refundLookup.message ?? "Could not verify this refund ID with Razorpay." },
      400,
    );
  }

  if (refundLookup.paymentId !== paymentDetails.provider_payment_id) {
    return json(
      {
        error:
          "This refund ID doesn't belong to this order's payment — double-check it was copied correctly.",
      },
      400,
    );
  }

  try {
    const result = await reconcileOrderRefund(supabaseAdmin, order);
    return json(result);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Failed to apply this refund." },
      500,
    );
  }
}
