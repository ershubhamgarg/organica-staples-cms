import { requireAuthedAdmin, json } from "../../_lib/http";
import { loadSkuCatalog } from "../../_lib/skuCatalog";
import {
  resolveOrderPackingItems,
  isOrderEligibleForPacking,
  type OrderCartItem,
} from "../../_lib/packing";

export const config = { runtime: "edge" };

type StartRequestBody = { orderId?: string };

/**
 * Starts (or resumes) the packing session for an order. Idempotent by
 * design: if an active session already exists for this order — because this
 * admin refreshed the page, or a second staff member opened the same order —
 * it's returned as-is rather than creating a second one. This *is* the
 * session lock: packing_sessions_one_active_per_order (a partial unique
 * index) is the actual enforcement; the catch-and-refetch below just makes
 * the race between two simultaneous "start" calls resolve to the same
 * session instead of an ugly 500.
 */
export default async function handler(request: Request): Promise<Response> {
  const ctx = await requireAuthedAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { supabaseAdmin, user } = ctx;

  let payload: StartRequestBody;
  try {
    payload = (await request.json()) as StartRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (!payload.orderId) return json({ error: "orderId is required." }, 400);

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, items, status, packing_status")
    .eq("id", payload.orderId)
    .single();

  if (orderError || !order) {
    return json({ error: orderError?.message ?? "Order was not found." }, 404);
  }

  if (order.packing_status === "packed") {
    return json(
      { error: "This order has already been packed. Reopen it first to make changes." },
      409,
    );
  }

  if (!isOrderEligibleForPacking(order.status)) {
    return json(
      { error: `Orders with status "${order.status}" cannot be packed.` },
      409,
    );
  }

  const { data: existingSession } = await supabaseAdmin
    .from("packing_sessions")
    .select("*")
    .eq("order_id", order.id)
    .in("status", ["in_progress", "reopened"])
    .maybeSingle();

  if (existingSession) {
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("packing_session_items")
      .select("*")
      .eq("session_id", existingSession.id)
      .order("id");

    if (itemsError) return json({ error: itemsError.message }, 500);
    return json({ session: existingSession, items: items ?? [], resumed: true });
  }

  const catalog = await loadSkuCatalog(supabaseAdmin);
  const { items: resolved, blockers } = resolveOrderPackingItems(
    (order.items as OrderCartItem[]) ?? [],
    catalog.byProductVariant,
    catalog.bundleComponents,
  );

  if (blockers.length > 0) {
    return json(
      {
        error:
          "This order can't be packed yet — some items need SKU/bundle configuration first.",
        blockers,
      },
      422,
    );
  }

  const { data: session, error: insertSessionError } = await supabaseAdmin
    .from("packing_sessions")
    .insert({
      order_id: order.id,
      status: "in_progress",
      order_items_snapshot: order.items,
      order_status_snapshot: order.status,
      started_by: user.email ?? user.id,
    })
    .select()
    .single();

  if (insertSessionError) {
    // Lost the race against a concurrent "start" call for the same order —
    // resume whichever session won instead of failing.
    if (insertSessionError.code === "23505") {
      const { data: winningSession } = await supabaseAdmin
        .from("packing_sessions")
        .select("*")
        .eq("order_id", order.id)
        .in("status", ["in_progress", "reopened"])
        .maybeSingle();
      if (winningSession) {
        const { data: items } = await supabaseAdmin
          .from("packing_session_items")
          .select("*")
          .eq("session_id", winningSession.id)
          .order("id");
        return json({ session: winningSession, items: items ?? [], resumed: true });
      }
    }
    return json({ error: insertSessionError.message }, 500);
  }

  const rows = resolved.map((r) => ({
    session_id: session.id,
    order_item_key: r.orderItemKey,
    sku: r.sku,
    product_id: r.productId,
    variant_id: r.variantId,
    label: r.label,
    weight: r.weight,
    parent_bundle_sku: r.parentBundleSku,
    required_qty: r.requiredQty,
    packed_qty: 0,
  }));

  const { data: items, error: itemsInsertError } = await supabaseAdmin
    .from("packing_session_items")
    .insert(rows)
    .select();

  if (itemsInsertError) {
    // Best-effort cleanup so a failed start doesn't leave an item-less
    // session sitting in "in_progress" and blocking future attempts.
    await supabaseAdmin.from("packing_sessions").delete().eq("id", session.id);
    return json({ error: itemsInsertError.message }, 500);
  }

  if (order.packing_status === "not_started") {
    await supabaseAdmin
      .from("orders")
      .update({ packing_status: "in_progress" })
      .eq("id", order.id);
  }

  return json({ session, items: items ?? [], resumed: false });
}
