import type { SupabaseClient } from "@supabase/supabase-js";
import type { BundleComponent, CatalogEntry } from "./packing";

export type SkuCatalog = {
  /** Keyed by `${productId}:${variantId ?? ""}` — matches the key format
   * resolveOrderPackingItems derives from an order's cart items. */
  byProductVariant: Map<string, CatalogEntry>;
  bySku: Map<string, CatalogEntry>;
  bundleComponents: BundleComponent[];
};

/**
 * Loads the full SKU catalog (products + variants + bundle components) in
 * the shape api/_lib/packing.ts's pure functions expect. Called fresh on
 * every packing request rather than cached — this catalog is small (tens of
 * rows) and staleness here would mean packing against an outdated SKU
 * assignment, which is exactly the kind of mistake this module exists to
 * prevent.
 *
 * A product/variant with no `sku` assigned yet is simply left out of both
 * maps — resolveOrderPackingItems treats that as "unresolved" for any order
 * that needs it (see its blockers).
 */
export async function loadSkuCatalog(
  supabaseAdmin: SupabaseClient,
): Promise<SkuCatalog> {
  const [productsRes, variantsRes, bundlesRes] = await Promise.all([
    supabaseAdmin.from("products").select("id, name, weight, sku, is_bundle"),
    supabaseAdmin
      .from("product_variants")
      .select("id, product_id, label, weight, sku, is_active"),
    supabaseAdmin
      .from("bundle_components")
      .select("bundle_sku, component_sku, component_qty"),
  ]);

  if (productsRes.error) throw new Error(productsRes.error.message);
  if (variantsRes.error) throw new Error(variantsRes.error.message);
  if (bundlesRes.error) throw new Error(bundlesRes.error.message);

  const byProductVariant = new Map<string, CatalogEntry>();
  const bySku = new Map<string, CatalogEntry>();

  for (const p of productsRes.data ?? []) {
    if (!p.sku) continue;
    const entry: CatalogEntry = {
      sku: p.sku,
      productId: String(p.id),
      variantId: null,
      label: p.name,
      weight: p.weight ?? null,
      // No product-level "active" flag exists beyond storefront visibility,
      // which is deliberately not checked here — an already-placed order
      // must stay packable even if the product is later hidden from sale.
      isActive: true,
      isBundle: Boolean(p.is_bundle),
    };
    byProductVariant.set(`${p.id}:`, entry);
    bySku.set(p.sku, entry);
  }

  for (const v of variantsRes.data ?? []) {
    if (!v.sku) continue;
    const entry: CatalogEntry = {
      sku: v.sku,
      productId: String(v.product_id),
      variantId: v.id,
      label: v.label,
      weight: v.weight ?? null,
      isActive: v.is_active ?? true,
      // Bundles are modeled at the product level only — a variant can't
      // itself be a preassembled bundle in this catalog.
      isBundle: false,
    };
    byProductVariant.set(`${v.product_id}:${v.id}`, entry);
    bySku.set(v.sku, entry);
  }

  const bundleComponents: BundleComponent[] = (bundlesRes.data ?? []).map(
    (b) => ({
      bundleSku: b.bundle_sku,
      componentSku: b.component_sku,
      componentQty: b.component_qty,
    }),
  );

  return { byProductVariant, bySku, bundleComponents };
}
