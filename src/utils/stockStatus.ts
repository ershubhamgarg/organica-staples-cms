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
