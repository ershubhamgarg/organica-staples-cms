export interface ProductVariant {
  /** Absent for a new, unsaved row in the form. */
  id?: number;
  product_id?: number;
  label: string;
  weight: string;
  price: number;
  wholesale_price?: number | null;
  sku?: string | null;
  sort_order?: number;
  is_active?: boolean;
  // Flattened client-side from product_variant_inventory, same pattern as
  // the base product's available_quantity/low_stock_threshold below.
  available_quantity?: number | null;
  low_stock_threshold?: number | null;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  wholesale_price?: number;
  images?: string[] | string | null;
  category: string;
  origin: string;
  weight: string;
  benefits: string[];
  discount?: number | null;
  rating?: number;
  review_count?: number;
  isVisible?: boolean | null;
  available_quantity?: number | null;
  reserved_quantity?: number | null;
  low_stock_threshold?: number | null;
  hsn_code?: string | null;
  launch_status?: "available" | "just_launched" | "launching_soon" | null;
  launch_date?: string | null;
  launch_badge_text?: string | null;
  created_at?: string;
  /** Absent/empty = a plain single-price product (today's behavior). */
  variants?: ProductVariant[];
}
