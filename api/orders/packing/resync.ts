import { requireAuthedAdmin, json } from "../../_lib/http";
import { loadSkuCatalog } from "../../_lib/skuCatalog";
import {
  resolveOrderPackingItems,
  isOrderEligibleForPacking,
  type OrderCartItem,
} from "../../_lib/packing";

export const config = { runtime: "edge" };

type ResyncRequestBody = { orderId?: string; sessionId?: string };

/**
 * Reconciles an active session's requirements against the order's *current*
 * state, after api/orders/packing/complete.ts detected drift (an edit or a
 * cancellation mid-session). Lines no longer on the order are removed; new
 * lines are added at packed_qty 0; a line whose required quantity dropped
 * has its packed_qty clamped down to match (effectively un-packing the
 * difference — there's no way to know which specific physical packs are now
 * excess, so the count is corrected rather than guessed at). Existing scan
 * history is left untouched either way, as the audit record of what actually
 * happened.
 */
export default async function handler(request: Request): Promise<Response> {
  const ctx = await requireAuthedAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { supabaseAdmin } = ctx;

  let payload: ResyncRequestBody;
  try {
    payload = (await request.json()) as ResyncRequestBody;
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
  if (session.status !== "in_progress" && session.status !== "reopened") {
    return json({ error: "This session is not active." }, 409);
  }

  if (!isOrderEligibleForPacking(order.status)) {
    return json(
      { error: `Order is now "${order.status}" — it can no longer be packed. Abandon this session instead.` },
      409,
    );
  }

  const catalog = await loadSkuCatalog(supabaseAdmin);
  const { items: resolved, blockers } = resolveOrderPackingItems(
    (order.items as OrderCartItem[]) ?? [],
    catalog.byProductVariant,
    catalog.bundleComponents,
  );

  if (blockers.length > 0) {
    return json(
      { error: "Some items on the updated order still need SKU/bundle configuration.", blockers },
      422,
    );
  }

  const { data: existingItems, error: existingError } = await supabaseAdmin
    .from("packing_session_items")
    .select("*")
    .eq("session_id", sessionId);
  if (existingError) return json({ error: existingError.message }, 500);

  const existingByKey = new Map((existingItems ?? []).map((i) => [i.order_item_key, i]));
  const resolvedKeys = new Set(resolved.map((r) => r.orderItemKey));

  const toRemove = (existingItems ?? []).filter((i) => !resolvedKeys.has(i.order_item_key));
  const toInsert = resolved.filter((r) => !existingByKey.has(r.orderItemKey));
  const toUpdate = resolved
    .map((r) => ({ resolved: r, existing: existingByKey.get(r.orderItemKey) }))
    .filter(
      (pair): pair is { resolved: typeof pair.resolved; existing: NonNullable<typeof pair.existing> } =>
        Boolean(pair.existing) && pair.existing!.required_qty !== pair.resolved.requiredQty,
    );

  if (toRemove.length > 0) {
    await supabaseAdmin
      .from("packing_session_items")
      .delete()
      .in("id", toRemove.map((i) => i.id));
  }

  if (toInsert.length > 0) {
    await supabaseAdmin.from("packing_session_items").insert(
      toInsert.map((r) => ({
        session_id: sessionId,
        order_item_key: r.orderItemKey,
        sku: r.sku,
        product_id: r.productId,
        variant_id: r.variantId,
        label: r.label,
        weight: r.weight,
        parent_bundle_sku: r.parentBundleSku,
        required_qty: r.requiredQty,
        packed_qty: 0,
      })),
    );
  }

  for (const { resolved: r, existing } of toUpdate) {
    await supabaseAdmin
      .from("packing_session_items")
      .update({
        required_qty: r.requiredQty,
        packed_qty: Math.min(existing.packed_qty, r.requiredQty),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  }

  await supabaseAdmin
    .from("packing_sessions")
    .update({
      order_items_snapshot: order.items,
      order_status_snapshot: order.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  const { data: freshItems, error: freshError } = await supabaseAdmin
    .from("packing_session_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("id");
  if (freshError) return json({ error: freshError.message }, 500);

  return json({
    items: freshItems ?? [],
    changed: { removed: toRemove.length, added: toInsert.length, adjusted: toUpdate.length },
  });
}
