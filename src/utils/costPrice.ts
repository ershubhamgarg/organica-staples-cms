/** Cost price = the base unit cost plus per-pack packaging costs, the same
 * three fields for both a plain product and a variant. */
export function getCostPrice(item: {
  wholesale_price?: number | null;
  packet_cost?: number | null;
  sticker_cost?: number | null;
}): number {
  return (
    (item.wholesale_price ?? 0) +
    (item.packet_cost ?? 0) +
    (item.sticker_cost ?? 0)
  );
}
