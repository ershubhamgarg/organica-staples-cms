import { requireAuthedAdmin, json } from "../_lib/http";

export const config = { runtime: "edge" };

type AssignSkuRequestBody = {
  entityType?: "product" | "variant";
  entityId?: number;
  sku?: string;
  /** Required (and must be true) to change a SKU that's already assigned —
   * "prevent silent SKU changes that could invalidate printed labels" is
   * enforced here, not by refusing the change outright, since a genuine
   * typo does need to be fixable. */
  confirmOverwrite?: boolean;
  reason?: string;
};

// Uppercase letters, digits and hyphens, 3-40 chars. Not a hard business
// requirement from Razorpay/Shiprocket/etc — chosen so printed labels stay
// short and scanner-friendly, and so a SKU can never be confused with a
// UUID, a price, or free text pasted into the wrong field.
const SKU_FORMAT = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/;

export default async function handler(request: Request): Promise<Response> {
  const ctx = await requireAuthedAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { supabaseAdmin, user } = ctx;

  let payload: AssignSkuRequestBody;
  try {
    payload = (await request.json()) as AssignSkuRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { entityType, entityId } = payload;
  const sku = payload.sku?.trim().toUpperCase();

  if (entityType !== "product" && entityType !== "variant") {
    return json({ error: "entityType must be 'product' or 'variant'." }, 400);
  }
  if (typeof entityId !== "number" || !Number.isFinite(entityId)) {
    return json({ error: "entityId is required." }, 400);
  }
  if (!sku || !SKU_FORMAT.test(sku)) {
    return json(
      {
        error:
          "SKU must be 3-40 characters: uppercase letters, digits and hyphens only.",
      },
      400,
    );
  }

  const table = entityType === "product" ? "products" : "product_variants";
  const { data: existingRow, error: fetchError } = await supabaseAdmin
    .from(table)
    .select("id, sku")
    .eq("id", entityId)
    .maybeSingle();

  if (fetchError) return json({ error: fetchError.message }, 500);
  if (!existingRow) {
    return json({ error: `No ${entityType} with id ${entityId} was found.` }, 404);
  }

  const oldSku: string | null = existingRow.sku ?? null;

  if (oldSku && oldSku !== sku && !payload.confirmOverwrite) {
    return json(
      {
        error: `This ${entityType} already has SKU ${oldSku} assigned — pass confirmOverwrite to change it (this can invalidate any labels already printed with the old SKU).`,
        requiresConfirmation: true,
        currentSku: oldSku,
      },
      409,
    );
  }

  if (oldSku === sku) {
    return json({ sku, unchanged: true });
  }

  const { error: updateError } = await supabaseAdmin
    .from(table)
    .update({ sku })
    .eq("id", entityId);

  if (updateError) {
    if (updateError.code === "23505") {
      return json(
        { error: `SKU ${sku} is already assigned to a different product/variant.` },
        409,
      );
    }
    return json({ error: updateError.message }, 500);
  }

  const { error: logError } = await supabaseAdmin.from("sku_change_log").insert({
    entity_type: entityType,
    entity_id: String(entityId),
    old_sku: oldSku,
    new_sku: sku,
    changed_by: user.email ?? user.id,
    reason: payload.reason?.trim() || null,
  });
  // A logging failure shouldn't roll back an otherwise-successful, already
  // committed SKU assignment — surface it, but don't fail the request over it.
  if (logError) {
    console.error("Failed to write sku_change_log entry:", logError.message);
  }

  return json({ sku, unchanged: false, previousSku: oldSku });
}
