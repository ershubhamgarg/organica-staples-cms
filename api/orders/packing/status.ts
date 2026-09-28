import { requireAuthedAdmin, json } from "../../_lib/http";

export const config = { runtime: "edge" };

type StatusRequestBody = { orderId?: string };

/**
 * Fetches the current packing session (if any) for an order, plus its items
 * and recent scan history — this is what makes progress survive a refresh:
 * the frontend calls this on mount instead of trusting any local state.
 */
export default async function handler(request: Request): Promise<Response> {
  const ctx = await requireAuthedAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { supabaseAdmin } = ctx;

  let payload: StatusRequestBody;
  try {
    payload = (await request.json()) as StatusRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (!payload.orderId) return json({ error: "orderId is required." }, 400);

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, status, packing_status, packed_by, packed_at")
    .eq("id", payload.orderId)
    .single();

  if (orderError || !order) {
    return json({ error: orderError?.message ?? "Order was not found." }, 404);
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("packing_sessions")
    .select("*")
    .eq("order_id", payload.orderId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) return json({ error: sessionError.message }, 500);

  if (!session) {
    return json({ order, session: null, items: [], recentScans: [] });
  }

  const [{ data: items, error: itemsError }, { data: recentScans, error: scansError }] =
    await Promise.all([
      supabaseAdmin
        .from("packing_session_items")
        .select("*")
        .eq("session_id", session.id)
        .order("id"),
      supabaseAdmin
        .from("packing_scan_events")
        .select("*")
        .eq("session_id", session.id)
        .neq("outcome", "pending")
        .order("scanned_at", { ascending: false })
        .limit(25),
    ]);

  if (itemsError) return json({ error: itemsError.message }, 500);
  if (scansError) return json({ error: scansError.message }, 500);

  return json({ order, session, items: items ?? [], recentScans: recentScans ?? [] });
}
