import { requireAuthedAdmin, json } from "../../_lib/http";
import { loadSkuCatalog } from "../../_lib/skuCatalog";
import { hasOrderDrifted, resolveOrderPackingItems, type OrderCartItem } from "../../_lib/packing";

export const config = { runtime: "edge" };

type CompleteRequestBody = { orderId?: string; sessionId?: string };

/**
 * Completes packing. Never trusts anything the frontend claims about
 * progress — packing_complete_session (a single Postgres function call, see
 * the migration) re-reads packed_qty/required_qty from the DB itself and
 * refuses unless every line matches exactly, and is naturally idempotent (a
 * repeated call for an already-completed session just reports success again
 * without re-applying anything).
 *
 * Before even attempting that, this re-resolves the order's *live* items
 * against the *live* catalog and diffs them against the session's snapshot
 * — an order edited or cancelled mid-session is caught here rather than
 * silently completed against stale requirements.
 */
export default async function handler(request: Request): Promise<Response> {
  const ctx = await requireAuthedAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { supabaseAdmin, user } = ctx;

  let payload: CompleteRequestBody;
  try {
    payload = (await request.json()) as CompleteRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { orderId, sessionId } = payload;
  if (!orderId || !sessionId) {
    return json({ error: "orderId and sessionId are required." }, 400);
  }

  const [{ data: session, error: sessionError }, { data: order, error: orderError }] =
    await Promise.all([
      supabaseAdmin.from("packing_sessions").select("*").eq("id", sessionId).single(),
      supabaseAdmin.from("orders").select("id, items, status").eq("id", orderId).single(),
    ]);

  if (sessionError || !session || session.order_id !== orderId) {
    return json({ error: "Packing session not found for this order." }, 400);
  }
  if (orderError || !order) {
    return json({ error: "Order not found." }, 400);
  }

  if (session.status === "completed") {
    // Idempotent replay — report success without re-checking anything else.
    return json({ ok: true, message: "Already completed." });
  }

  if (
    hasOrderDrifted(
      session.order_items_snapshot as OrderCartItem[],
      session.order_status_snapshot,
      (order.items as OrderCartItem[]) ?? [],
      order.status,
    )
  ) {
    const catalog = await loadSkuCatalog(supabaseAdmin);
    const { blockers } = resolveOrderPackingItems(
      (order.items as OrderCartItem[]) ?? [],
      catalog.byProductVariant,
      catalog.bundleComponents,
    );
    return json(
      {
        ok: false,
        driftDetected: true,
        error:
          "This order changed since packing started — resync the session before completing it.",
        blockers,
      },
      409,
    );
  }

  const { data: result, error: rpcError } = await supabaseAdmin.rpc(
    "packing_complete_session",
    { p_session_id: sessionId, p_completed_by: user.email ?? user.id },
  );

  if (rpcError) return json({ error: rpcError.message }, 500);

  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.ok) {
    return json({ ok: false, error: row?.message ?? "Could not complete packing." }, 409);
  }

  return json({ ok: true, message: row.message });
}
