import { requireAuthedAdmin, json } from "../../_lib/http";

export const config = { runtime: "edge" };

type ReopenRequestBody = { orderId?: string; sessionId?: string; reason?: string };

/**
 * Reopens a completed packing session. Requires a reason (this system has no
 * role/permission tiers — every other destructive admin action here, e.g.
 * order cancellation, is gated the same way: any authenticated admin, with
 * the reason serving as the audit trail instead of a permission check).
 */
export default async function handler(request: Request): Promise<Response> {
  const ctx = await requireAuthedAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { supabaseAdmin, user } = ctx;

  let payload: ReopenRequestBody;
  try {
    payload = (await request.json()) as ReopenRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { orderId, sessionId } = payload;
  const reason = payload.reason?.trim();

  if (!orderId || !sessionId) {
    return json({ error: "orderId and sessionId are required." }, 400);
  }
  if (!reason) {
    return json({ error: "A reason is required to reopen packing." }, 400);
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("packing_sessions")
    .select("id, order_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session || session.order_id !== orderId) {
    return json({ error: "Packing session not found for this order." }, 400);
  }

  const { data: result, error: rpcError } = await supabaseAdmin.rpc(
    "packing_reopen_session",
    { p_session_id: sessionId, p_reopened_by: user.email ?? user.id, p_reason: reason },
  );

  if (rpcError) return json({ error: rpcError.message }, 500);

  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.ok) {
    return json({ error: row?.message ?? "Could not reopen this session." }, 409);
  }

  return json({ ok: true, message: row.message });
}
