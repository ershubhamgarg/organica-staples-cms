import type { Order } from "../store/orderStore";

// Mirrors the storefront's checkout: a barter/collaboration order is placed
// with this payment method by an influencer redeeming a coupon flagged
// `is_free_order` in discount_coupons. Nothing is charged (total_amount is
// 0, shipping/convenience/COD are all waived), but the goods really ship,
// so inventory, order_items, GST line values and cost-to-company are all
// populated exactly as they are for a paid order. Treat these as marketing
// spend rather than sales — the product cost is real, the revenue is not.
export const BARTER_COLLAB_PAYMENT_METHOD = "barter_collab";

export function isCollabOrder(
  order: Pick<Order, "payment_method">,
): boolean {
  return order.payment_method === BARTER_COLLAB_PAYMENT_METHOD;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  razorpay: "Razorpay",
  cod: "Cash on Delivery",
  [BARTER_COLLAB_PAYMENT_METHOD]: "Barter Collab",
  instagram_story_verification: "Instagram Story",
};

/**
 * Human-readable payment method. Falls back to de-underscoring whatever the
 * storefront wrote, so a new method added there shows up sensibly here
 * instead of as a raw snake_case token.
 */
export function formatPaymentMethodLabel(
  method: string | null | undefined,
): string {
  if (!method) return "—";

  return (
    PAYMENT_METHOD_LABELS[method] ??
    method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
