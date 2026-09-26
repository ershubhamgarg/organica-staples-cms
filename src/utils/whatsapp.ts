import type { Order } from "../store/orderStore";
import { formatCurrency } from "./currency";
import { isLocalOrder } from "./localOrder";

/**
 * Normalizes a stored delivery-address phone number (typically a bare
 * 10-digit Indian mobile, sometimes with a leading 0/+91/91) into the plain
 * digits-with-country-code format wa.me expects.
 */
export function formatWhatsAppNumber(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0"))
    return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function itemLine(item: Order["items"][number]): string {
  const size = item.variantLabel || item.weight;
  return `• ${item.name}${size ? ` (${size})` : ""} × ${item.quantity}`;
}

/**
 * A warm, on-brand order-confirmation message for the admin to send
 * customer-facing over WhatsApp — not an automated notification, since
 * there's no WhatsApp Business API wired up; this is a manually-triggered,
 * pre-filled draft the admin reviews before sending.
 */
export function buildOrderConfirmationMessage(
  order: Order,
  invoiceUrl?: string | null,
): string {
  const name = order.delivery_address?.name?.trim().split(" ")[0] || "there";
  const shortId = order.id.slice(0, 8).toUpperCase();
  const items = (order.items ?? []).map(itemLine).join("\n");

  return [
    `Hi ${name}! 🌿✨`,
    "",
    "Welcome to the ANNVRIKSH family! We're so glad to have you with us on your journey to a purer, healthier pantry.",
    "",
    `Great news — we've received your order *#${shortId}* and it's already being prepared with care. 💚`,
    "",
    "🧺 Here's what's on its way to you:",
    items,
    "",
    `💰 Order Total: ₹${formatCurrency(order.total_amount)}`,
    "",
    "Get ready to restock your pantry with pure, chemical-free, ethically-sourced staples — the way nature intended.",
    "",
    ...(invoiceUrl ? [`🧾 Your GST Invoice: ${invoiceUrl}`, ""] : []),
    "Thank you for choosing ANNVRIKSH. Here's to wholesome living! 🙏",
    "",
    "— Team ANNVRIKSH",
  ].join("\n");
}

/**
 * A status-appropriate shipment update for the admin to send over
 * WhatsApp — mirrors the same shipment-progress reasoning
 * getUnifiedOrderStatus (shippingStatus.ts) uses for the on-screen badge,
 * but as a customer-facing message rather than a CMS label. Local
 * (hand-delivered) orders never get a courier/AWB/tracking link by
 * design, so they go through order.status instead of shipping_status.
 */
export function buildOrderUpdateMessage(order: Order): string {
  const name = order.delivery_address?.name?.trim().split(" ")[0] || "there";
  const shortId = order.id.slice(0, 8).toUpperCase();
  const local = isLocalOrder(order);
  const shippingStatus = order.shipping_status?.toLowerCase() ?? null;

  let statusLine: string;
  // Only Shiprocket-tracked shipments (not local/hand-delivered ones) ever
  // have a real courier/AWB/tracking link to include.
  let includeTracking = false;

  if (order.status === "cancelled") {
    statusLine = `Your order *#${shortId}* has been cancelled. If this wasn't expected, just reply here — we're happy to help. 💬`;
  } else if (local) {
    statusLine =
      order.status === "delivered"
        ? `Your order *#${shortId}* has been hand-delivered! We hope you enjoy your fresh pantry essentials. 💚`
        : `Your order *#${shortId}* is being prepared for hand delivery and will reach you soon! 🌿`;
  } else if (shippingStatus === "delivered" || order.status === "delivered") {
    statusLine = `Your order *#${shortId}* has been delivered! We hope you enjoy your fresh pantry essentials. 💚`;
  } else if (shippingStatus === "out_for_delivery") {
    statusLine = `Exciting news — your order *#${shortId}* is out for delivery today and should reach you very soon! 📦`;
    includeTracking = true;
  } else if (shippingStatus === "in_transit") {
    statusLine = `Your order *#${shortId}* is on its way and getting closer to you every day! 🚚`;
    includeTracking = true;
  } else if (shippingStatus === "awb_assigned" || shippingStatus === "created") {
    statusLine = `Your order *#${shortId}* has been picked up by our courier partner and is now on its way to you! 🚚`;
    includeTracking = true;
  } else {
    statusLine = `Your order *#${shortId}* is being packed with care and will be shipped very soon! 📦`;
  }

  const courierLine =
    includeTracking && order.shiprocket_courier_name
      ? `Courier: ${order.shiprocket_courier_name}${order.shiprocket_awb_code ? ` (AWB: ${order.shiprocket_awb_code})` : ""}`
      : null;
  const trackingLine =
    includeTracking && order.shiprocket_tracking_url
      ? `📍 Track your shipment: ${order.shiprocket_tracking_url}`
      : null;

  return [
    `Hi ${name}! 🌿`,
    "",
    statusLine,
    ...(courierLine ? ["", courierLine] : []),
    ...(trackingLine ? ["", trackingLine] : []),
    "",
    "Thank you for shopping with ANNVRIKSH! 🙏",
    "",
    "— Team ANNVRIKSH",
  ].join("\n");
}

const STORE_URL =
  (import.meta.env.VITE_STORE_URL as string | undefined)?.trim() ||
  "https://annvriksh.com";

/**
 * A "time to refill your pantry" promo nudge for a customer whose last order
 * has gone quiet (see reorderReminder.ts). Deliberately makes no discount
 * promise — an offer code, if one is wanted, should be added here explicitly.
 */
export function buildReorderReminderMessage(
  customerName: string,
  daysSinceLastOrder: number,
): string {
  const name = customerName.trim().split(" ")[0] || "there";

  return [
    `Hi ${name}! 🌿✨`,
    "",
    `It's been ${daysSinceLastOrder} days since your last pantry order with ANNVRIKSH — and we've been missing you. 💚`,
    "",
    "Time to refill your kitchen with pure goodness: chemical-free dals, stone-ground spices, seeds and staples — ethically sourced and delivered fresh to your door. 🧺",
    "",
    `🛒 Restock your pantry: ${STORE_URL}`,
    "",
    "Here's to wholesome living! 🙏",
    "",
    "— Team ANNVRIKSH",
  ].join("\n");
}

export function getWhatsAppLink(phone: string, message: string): string {
  // `wa.me` is a redirector — it forwards to api.whatsapp.com, and that
  // extra hop is a known source of mangled/dropped emoji in the prefilled
  // text (emoji outside the Basic Multilingual Plane, i.e. most of the ones
  // used above, need a 4-byte UTF-8 sequence, and the redirect's own
  // decode/re-encode step doesn't always survive that intact). Linking
  // straight to api.whatsapp.com skips that hop. The %-encoding itself was
  // already verified correct (encodeURIComponent("🌿") → the exact standard
  // UTF-8 bytes for U+1F33F) — this isn't an encoding bug on our side, it's
  // wa.me's redirect that drops it.
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}
