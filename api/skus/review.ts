import { requireAuthedAdmin, json } from "../_lib/http";

export const config = { runtime: "edge" };

/**
 * Lists every product/variant that still needs SKU attention: missing a SKU
 * entirely, or (defensively — the unique partial index in the migration
 * should make this structurally impossible going forward) sharing a SKU with
 * another row. Backs the "review workflow" required instead of silently
 * overwriting/assigning SKUs on existing catalog data.
 */
export default async function handler(request: Request): Promise<Response> {
  const ctx = await requireAuthedAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { supabaseAdmin } = ctx;

  const [productsRes, variantsRes] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, name, weight, category, sku, is_bundle")
      .order("id"),
    supabaseAdmin
      .from("product_variants")
      .select("id, product_id, label, weight, sku, is_active")
      .order("product_id"),
  ]);

  if (productsRes.error) {
    return json({ error: productsRes.error.message }, 500);
  }
  if (variantsRes.error) {
    return json({ error: variantsRes.error.message }, 500);
  }

  const products = productsRes.data ?? [];
  const variants = variantsRes.data ?? [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const skuCounts = new Map<string, number>();
  for (const row of [...products, ...variants]) {
    if (!row.sku) continue;
    skuCounts.set(row.sku, (skuCounts.get(row.sku) ?? 0) + 1);
  }
  const duplicateSkus = new Set(
    [...skuCounts.entries()].filter(([, count]) => count > 1).map(([sku]) => sku),
  );

  const missingProducts = products
    // A product that has variants doesn't need its own SKU — it's never
    // itself a packable unit; each variant is.
    .filter((p) => !p.sku && !variants.some((v) => v.product_id === p.id))
    .map((p) => ({
      type: "product" as const,
      productId: p.id,
      variantId: null,
      name: p.name,
      weight: p.weight,
      category: p.category,
      currentSku: p.sku,
    }));

  const missingVariants = variants
    .filter((v) => !v.sku)
    .map((v) => ({
      type: "variant" as const,
      productId: v.product_id,
      variantId: v.id,
      name: `${productById.get(v.product_id)?.name ?? `Product #${v.product_id}`} — ${v.label}`,
      weight: v.weight,
      category: productById.get(v.product_id)?.category ?? null,
      currentSku: v.sku,
    }));

  const duplicates = [...products, ...variants]
    .filter((row) => row.sku && duplicateSkus.has(row.sku))
    .map((row) =>
      "product_id" in row
        ? {
            type: "variant" as const,
            productId: row.product_id,
            variantId: row.id,
            name: `${productById.get(row.product_id)?.name ?? `Product #${row.product_id}`} — ${row.label}`,
            sku: row.sku,
          }
        : {
            type: "product" as const,
            productId: row.id,
            variantId: null,
            name: row.name,
            sku: row.sku,
          },
    );

  return json({
    missing: [...missingProducts, ...missingVariants],
    duplicates,
    totalNeedingReview: missingProducts.length + missingVariants.length + duplicates.length,
  });
}
