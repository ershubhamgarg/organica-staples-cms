import { getSupabaseAdmin } from "../_lib/supabaseAdmin";
import { reconcileOrderRefund } from "../_lib/refundReconciliation";

export const config = { runtime: "edge" };

type RefundStatusRequestBody = {
  orderId?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Reconciles an order's refund fields against Razorpay's own record —
 * catches a refund issued directly on the Razorpay dashboard (or any other
 * out-of-band way), which this app would otherwise never learn about since
 * it only ever updates refund_status/refund_amount when *it* issues a
 * refund (via cancel.ts or refund.ts). Called automatically whenever
 * OrderDetails.tsx loads, and again on demand from its "Refresh" button.
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
  // cares about) because the response returns this same `order` object as
  // one of its branches (when reconcileOrderRefund finds nothing to
  // change) — the client's store action replaces the order's entire entry
  // in its global list with whatever `order` comes back, so a partial row
  // here would silently truncate that order everywhere else it's displayed.
  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return json({ error: fetchError?.message ?? "Order was not found." }, 400);
  }

  try {
    const result = await reconcileOrderRefund(supabaseAdmin, order);
    return json(result);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Failed to check refund status." },
      500,
    );
  }
}
