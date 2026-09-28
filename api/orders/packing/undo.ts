import { requireAuthedAdmin, json } from "../../_lib/http";

export const config = { runtime: "edge" };

type UndoRequestBody = { orderId?: string; sessionId?: string; reason?: string };

/**
 * Undoes the most recent accepted-and-not-yet-undone scan in this session —
 * an audited action (who, when, why) rather than a silent decrement.
 */
export default async function handler(request: Request): Promise<Response> {
  const ctx = await requireAuthedAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { supabaseAdmin, user } = ctx;

  let payload: UndoRequestBody;
  try {
    payload = (await request.json()) as UndoRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { orderId, sessionId } = payload;
  const reason = payload.reason?.trim();

  if (!orderId || !sessionId) {
    return json({ error: "orderId and sessionId are required." }, 400);
  }
  if (!reason) {
    return json({ error: "A reason is required to undo a scan." }, 400);
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("packing_sessions")
    .select("id, order_id, status")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session || session.order_id !== orderId) {
    return json({ error: "Packing session not found for this order." }, 400);
  }
  if (session.status !== "in_progress" && session.status !== "reopened") {
    return json({ error: "This session is not active." }, 409);
  }

  const { data: lastScan, error: lastScanError } = await supabaseAdmin
    .from("packing_scan_events")
    .select("*")
    .eq("session_id", sessionId)
    .eq("outcome", "accepted")
    .eq("undone", false)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastScanError) return json({ error: lastScanError.message }, 500);
  if (!lastScan || !lastScan.session_item_id) {
    return json({ error: "There is no accepted scan left to undo." }, 409);
  }

  const { data: decremented, error: decrementError } = await supabaseAdmin.rpc(
    "packing_decrement_item",
    { p_item_id: lastScan.session_item_id },
  );
  if (decrementError) return json({ error: decrementError.message }, 500);

  const updatedItem = Array.isArray(decremented) ? decremented[0] : decremented;
  if (!updatedItem) {
    // packed_qty was already 0 for this item — someone else undid it, or an
    // undo already ran for this exact event; treat as already-done.
    return json({ error: "This scan was already undone." }, 409);
  }

  const { error: markError } = await supabaseAdmin
    .from("packing_scan_events")
    .update({
      undone: true,
      undone_by: user.email ?? user.id,
      undone_at: new Date().toISOString(),
      undo_reason: reason,
    })
    .eq("id", lastScan.id);

  if (markError) return json({ error: markError.message }, 500);

  return json({ item: updatedItem, undoneEvent: { ...lastScan, undone: true } });
}
