// Mirrors the backfill in the storefront migration 20260921010000_product_slugs.sql
// (lowercase, non-alphanumerics → "-", trimmed, capped at 70 chars).
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 70)
    .replace(/^-+|-+$/g, "");
}
