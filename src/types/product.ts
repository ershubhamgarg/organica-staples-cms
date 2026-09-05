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
}
