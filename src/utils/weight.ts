// Mirrors the storefront's lib/shiprocket.ts parseWeightKg exactly, so the
// gross weight shown here always matches what Shiprocket is actually quoted
// for shipping this same order.
export function parseWeightKg(weight: string | undefined | null): number {
  if (!weight) return 0;
  const normalized = weight.toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)/);

  if (!match) return 0;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return 0;

  if (normalized.includes("kg") || normalized.includes("litre")) {
    return value;
  }

  if (normalized.includes("ml")) {
    return value / 1000;
  }

  return value / 1000; // grams by default
}

export function getOrderGrossWeightKg(
  items: { weight?: string | null; quantity: number }[] | null | undefined,
): number {
  // A malformed/partial order object (missing `items` entirely) should
  // render as 0kg, not crash the page it's rendered on — this has actually
  // happened in production when an API route returned a stripped-down order
  // object into the shared order store (see api/orders/refund-status.ts).
  if (!items) return 0;
  return items.reduce(
    (sum, item) => sum + parseWeightKg(item.weight) * item.quantity,
    0,
  );
}

export function formatWeight(kg: number): string {
  if (kg < 1) {
    return `${Math.round(kg * 1000)} g`;
  }
  return `${kg.toFixed(2)} kg`;
}
