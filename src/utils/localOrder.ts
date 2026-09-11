import type { Order } from "../store/orderStore";

// Mirrors the storefront's lib/shipping.ts — orders delivered to this
// pincode are treated as in-house local delivery: hand-delivered by the
// seller directly, never routed through Shiprocket. They never get a
// shiprocket_order_id/shipment_id/awb_code, courier, or tracking info —
// not because something failed to sync, but by design, so none of the
// Shiprocket-shaped UI/logic elsewhere in this app applies to them. Keep
// this pincode in sync with the storefront's own
// NEXT_PUBLIC_LOCAL_DELIVERY_PINCODE (see PROJECT_CONTEXT.md).
const LOCAL_DELIVERY_PINCODE =
  (import.meta.env.VITE_LOCAL_DELIVERY_PINCODE as string | undefined)?.trim() ||
  "125055";

export function isLocalOrder(
  order: Pick<Order, "delivery_address" | "shipping_status">,
): boolean {
  // The storefront only writes shipping_status "local_delivery" when its
  // own NEXT_PUBLIC_ENABLE_SHIPROCKET_SHIPMENT flag is on — with it off,
  // a local order's shipping_status looks identical to any other pending
  // order's. The delivery pincode is captured unconditionally at checkout
  // either way, so it's the more robust signal; both are checked.
  if (order.shipping_status === "local_delivery") return true;

  const zip = order.delivery_address?.zipCode?.replace(/\D/g, "");
  return Boolean(zip) && zip === LOCAL_DELIVERY_PINCODE;
}
