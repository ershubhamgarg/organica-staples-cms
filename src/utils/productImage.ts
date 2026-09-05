import type { Product } from "../types/product";

// Mirrors the storefront's lib/data.ts getProductThumbnail — the `images`
// jsonb array is the only real image column on `products` (there is no
// singular `image` column in the live schema), so it's always the source
// of truth here.
export function getProductThumbnail(
  product: Pick<Product, "images">,
): string | null {
  if (Array.isArray(product.images) && product.images.length > 0) {
    return product.images[0];
  }
  if (typeof product.images === "string" && product.images) {
    return product.images;
  }
  return null;
}
