import type { Product } from "../types/product";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export function getStockStatus(
  product: Pick<Product, "available_quantity" | "low_stock_threshold">,
): { status: StockStatus; label: string; variant: string } {
  const qty = product.available_quantity ?? 0;

  if (qty <= 0) {
    return { status: "out_of_stock", label: "Out of Stock", variant: "danger" };
  }

  if (
    product.low_stock_threshold != null &&
    qty <= product.low_stock_threshold
  ) {
    return { status: "low_stock", label: "Low Stock", variant: "warning" };
  }

  return { status: "in_stock", label: "In Stock", variant: "success" };
}

// A product with variants has no single meaningful stock level of its own
// — each size/weight tracks its own quantity — so its status badge reflects
// the worst case across all variants rather than the (unused) base fields.
export function getProductAggregateStatus(product: Product) {
  if (!product.variants || product.variants.length === 0) {
    return getStockStatus(product);
  }
  const statuses = product.variants.map((v) => getStockStatus(v).status);
  if (statuses.every((s) => s === "out_of_stock")) {
    return getStockStatus({ available_quantity: 0, low_stock_threshold: 0 });
  }
  if (statuses.some((s) => s === "out_of_stock" || s === "low_stock")) {
    return { status: "low_stock" as const, label: "Low Stock", variant: "warning" };
  }
  return { status: "in_stock" as const, label: "In Stock", variant: "success" };
}
