import type { Order } from "../store/orderStore";
import { isLocalOrder } from "./localOrder";

// Shared between Orders.tsx (list) and OrderDetails.tsx (header badge) so a
// given shipping_status always gets the same color/label wherever it's
// shown. Colors follow a severity gradient rather than a literal per-status
// palette (there are more distinct statuses than the app's 5 badge colors):
// danger (a real sync failure) > warning (not yet moving, or a cancelled
// shipment that needs a new AWB) > info (in motion) > success (arrived or
// about to). "danger" for the plain word "Cancelled" is reserved for the
// order itself (getUnifiedOrderStatus) — a cancelled *shipment* is warning.
export function getShippingStatusColor(status: string | null | undefined): string {
  switch (status?.toLowerCase()) {
    case "sync_failed":
      return "danger";
    // A cancelled shipment (RTO, failed pickup, a manual cancel on
    // Shiprocket's own dashboard) is not a dead end for the order — it
    // typically just needs a new AWB — so it gets "warning", not "danger".
    // "danger" is reserved for the order itself being cancelled (see
    // getUnifiedOrderStatus below), so the two never share a color.
    case "cancelled":
    case "not_configured":
    case "pending":
    case "created":
      return "warning";
    case "awb_assigned":
    case "in_transit":
      return "info";
    case "out_for_delivery":
    case "delivered":
      return "success";
    default:
      return "secondary";
  }
}

export function formatShippingStatusLabel(status: string | null | undefined): string {
  if (!status) return "Not Set";
  // Worded as "Shipment Cancelled" rather than a bare "Cancelled" so it's
  // never mistaken for the order itself being cancelled (see
  // getUnifiedOrderStatus below, which reserves the plain "Cancelled" label
  // for that) — the shipment/AWB was voided, but the order is still active.
  if (status.toLowerCase() === "cancelled") return "Shipment Cancelled";
  return status.replace(/_/g, " ");
}

// Coarse order-level statuses (pending/processing/shipped/...) that predate
// Shiprocket tracking, colored the same way `Orders.tsx`'s table already did
// — kept here as the fallback tier for getUnifiedOrderStatus below, for
// orders with no meaningful shipping_status yet.
function getOrderStatusColor(status: string | null | undefined): string {
  switch (status?.toLowerCase()) {
    case "delivered":
    case "approved":
      return "success";
    case "pending":
    case "processing":
      return "warning";
    case "shipped":
      return "info";
    case "cancelled":
    case "rejected":
      return "danger";
    default:
      return "secondary";
  }
}

const NON_INFORMATIVE_SHIPPING_STATUSES = new Set(["pending", "not_configured"]);

/**
 * A single, unified status for a row that used to need two separate
 * columns (order status + shipping status): whichever of the two is more
 * specific and informative right now. Cancelled always wins outright (it's
 * the one state that overrides shipping progress entirely), local orders
 * always show as such (their shipping_status may or may not literally be
 * "local_delivery" depending on when/how they were placed — see
 * isLocalOrder), and otherwise a real Shiprocket-driven shipping_status
 * (created/awb_assigned/in_transit/out_for_delivery/delivered/sync_failed)
 * is preferred over the coarser order status, falling back to the order
 * status only while there's nothing more specific yet (pending/processing,
 * before a shipment exists).
 */
export function getUnifiedOrderStatus(
  order: Pick<Order, "status" | "shipping_status" | "delivery_address">,
): { label: string; color: string } {
  if (order.status === "cancelled") {
    return { label: "Cancelled", color: "danger" };
  }

  if (isLocalOrder(order)) {
    return { label: "Local Delivery", color: "local" };
  }

  if (
    order.shipping_status &&
    !NON_INFORMATIVE_SHIPPING_STATUSES.has(order.shipping_status)
  ) {
    return {
      label: formatShippingStatusLabel(order.shipping_status),
      color: getShippingStatusColor(order.shipping_status),
    };
  }

  return {
    label: order.status,
    color: getOrderStatusColor(order.status),
  };
}
