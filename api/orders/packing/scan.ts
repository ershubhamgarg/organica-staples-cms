import { requireAuthedAdmin, json } from "../../_lib/http";
import { loadSkuCatalog } from "../../_lib/skuCatalog";
import {
  validateScan,
  isOrderEligibleForPacking,
  type SessionItemLike,
} from "../../_lib/packing";

export const config = { runtime: "edge" };

type ScanRequestBody = {
  orderId?: string;
  sessionId?: string;
  rawInput?: string;
  /** One per physical scan attempt, generated client-side — see the
   * frontend's scanner component. Required, not optional: without it there
   * is no way to tell a genuine retried request apart from a second,
   * separate scan of the same SKU. */
  idempotencyKey?: string;
};

const MAX_RAW_INPUT_LENGTH = 128;

export default async function handler(request: Request): Promise<Response> {
  const ctx = await requireAuthedAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { supabaseAdmin, user } = ctx;

  let payload: ScanRequestBody;
  try {
    payload = (await request.json()) as ScanRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { orderId, sessionId, idempotencyKey } = payload;
  const rawInput = payload.rawInput?.toString() ?? "";

  if (!orderId || !sessionId) {
    return json({ error: "orderId and sessionId are required." }, 400);
  }
  if (!idempotencyKey) {
    return json({ error: "idempotencyKey is required." }, 400);
  }
  if (!rawInput.trim()) {
    return json({ error: "Scanned/entered value was empty." }, 400);
  }
  if (rawInput.length > MAX_RAW_INPUT_LENGTH) {
    return json({ error: "Scanned value is too long to be a valid SKU." }, 400);
  }

  const scannedBy = user.email ?? user.id;

  // Claims the idempotency key FIRST, before any validation or side effect —
  // a retried request with the same key always lands here and short-circuits
  // on the unique-violation below, so the increment further down can only
  // ever run once per physical scan attempt.
  const { data: claimedEvent, error: claimError } = await supabaseAdmin
    .from("packing_scan_events")
    .insert({
      session_id: sessionId,
      raw_input: rawInput,
      outcome: "pending",
      scanned_by: scannedBy,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();

  if (claimError) {
    if (claimError.code === "23505") {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("packing_scan_events")
        .select("*")
        .eq("session_id", sessionId)
        .eq("idempotency_key", idempotencyKey)
        .single();
      if (existingError) return json({ error: existingError.message }, 500);
      if (existing.outcome === "pending") {
        // Extremely narrow window (a crash mid-request) — ask the client to
        // check /status rather than guessing at an outcome we never finished
        // computing.
        return json(
          { error: "This scan is still being processed — check packing status and retry." },
          409,
        );
      }
      const { data: item } = existing.session_item_id
        ? await supabaseAdmin
            .from("packing_session_items")
            .select("*")
            .eq("id", existing.session_item_id)
            .single()
        : { data: null };
      return json({ event: existing, item, replay: true });
    }
    return json({ error: claimError.message }, 500);
  }

  const [{ data: session, error: sessionError }, { data: order, error: orderError }] =
    await Promise.all([
      supabaseAdmin
        .from("packing_sessions")
        .select("id, order_id, status")
        .eq("id", sessionId)
        .single(),
      supabaseAdmin.from("orders").select("id, status").eq("id", orderId).single(),
    ]);

  // These are malformed requests, not real scan attempts — the claimed
  // "pending" event row is discarded rather than forced into an outcome
  // that doesn't actually describe what happened, so it never shows up in
  // scan history.
  if (sessionError || !session || session.order_id !== orderId) {
    await supabaseAdmin.from("packing_scan_events").delete().eq("id", claimedEvent.id);
    return json({ error: "Packing session not found for this order." }, 400);
  }
  if (orderError || !order) {
    await supabaseAdmin.from("packing_scan_events").delete().eq("id", claimedEvent.id);
    return json({ error: "Order not found." }, 400);
  }

  const { data: rawItems, error: itemsError } = await supabaseAdmin
    .from("packing_session_items")
    .select("*")
    .eq("session_id", sessionId);

  if (itemsError) {
    await supabaseAdmin.from("packing_scan_events").delete().eq("id", claimedEvent.id);
    return json({ error: itemsError.message }, 500);
  }

  const sessionItems: SessionItemLike[] = (rawItems ?? []).map((r) => ({
    id: r.id,
    sku: r.sku,
    productId: r.product_id,
    requiredQty: r.required_qty,
    packedQty: r.packed_qty,
  }));

  const isEligible =
    (session.status === "in_progress" || session.status === "reopened") &&
    isOrderEligibleForPacking(order.status);

  const catalog = await loadSkuCatalog(supabaseAdmin);
  const validation = validateScan(rawInput, isEligible, sessionItems, catalog.bySku);

  let finalOutcome = validation.outcome;
  let finalMessage = validation.message;
  let finalItemRow: unknown = null;

  if (validation.outcome === "accepted" && validation.matchedItem) {
    const { data: incremented, error: incrementError } = await supabaseAdmin.rpc(
      "packing_increment_item",
      { p_item_id: validation.matchedItem.id },
    );
    if (incrementError) {
      await supabaseAdmin
        .from("packing_scan_events")
        .delete()
        .eq("id", claimedEvent.id);
      return json({ error: incrementError.message }, 500);
    }

    const updatedRow = Array.isArray(incremented) ? incremented[0] : incremented;
    if (!updatedRow) {
      // Lost a genuine race to another concurrent scan that filled the last
      // remaining slot first — the DB, not our pre-check, is what actually
      // enforces the limit.
      finalOutcome = "rejected_overpack";
      finalMessage = `Already have the required pack(s) of ${validation.matchedItem.sku} — this scan wasn't counted.`;
    } else {
      finalItemRow = updatedRow;
    }
  }

  const sessionItemId =
    finalItemRow && typeof finalItemRow === "object" && "id" in finalItemRow
      ? (finalItemRow as { id: number }).id
      : null;

  await supabaseAdmin
    .from("packing_scan_events")
    .update({
      outcome: finalOutcome,
      message: finalMessage,
      resolved_sku: validation.matchedItem?.sku ?? null,
      session_item_id: sessionItemId,
    })
    .eq("id", claimedEvent.id);

  return json({ outcome: finalOutcome, message: finalMessage, item: finalItemRow });
}
