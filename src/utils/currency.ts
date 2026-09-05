// Consistent ₹ amount formatting across the app — always exactly two
// decimal places, regardless of whether the underlying value is a whole
// number or has more precision than that (e.g. GST/gateway-fee math).
export function formatCurrency(amount: number | null | undefined): string {
  const value = amount ?? 0;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
