import type { Order } from "../store/orderStore";
import { formatCurrency } from "./currency";

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
