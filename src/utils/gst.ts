// Mirrors the storefront's lib/invoice.tsx GST math exactly (seller
// constants, state-code table, intra/inter-state determination, and the
// GST-inclusive-price tax split) so the numbers a CA sees in this report
// always reconcile with the numbers on the actual tax invoices the
// storefront generates for the same orders.
import type { Order } from "../store/orderStore";

export const SELLER = {
  name: "ANNVRIKSH",
  state: "Haryana",
  stateCode: "06",
  gstin: "06AYVPK4873C1Z2",
};

const GST_RATE = 5; // Flat rate across all products, GST-inclusive pricing.

/** April–March Indian financial year, e.g. "2026-27". */
export function getFinancialYear(date: Date): string {
  const year = date.getFullYear();
  const isBeforeApril = date.getMonth() < 3;
  const startYear = isBeforeApril ? year - 1 : year;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// GST state codes (Schedule III, CGST Act). Buyer state is free-text at
// checkout, so lookups are case-insensitive and tolerant of "&"/"and".
const STATE_CODES: Record<string, string> = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  uttaranchal: "05",
  haryana: "06",
  delhi: "07",
  "new delhi": "07",
  "nct of delhi": "07",
  rajasthan: "08",
  "uttar pradesh": "09",
  bihar: "10",
  sikkim: "11",
  "arunachal pradesh": "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  "west bengal": "19",
  jharkhand: "20",
  odisha: "21",
  orissa: "21",
  chhattisgarh: "22",
  "madhya pradesh": "23",
  gujarat: "24",
  "daman and diu": "25",
  "dadra and nagar haveli": "26",
  maharashtra: "27",
  karnataka: "29",
  goa: "30",
  lakshadweep: "31",
  kerala: "32",
  "tamil nadu": "33",
  puducherry: "34",
  pondicherry: "34",
  "andaman and nicobar islands": "35",
  telangana: "36",
  "andhra pradesh": "37",
  ladakh: "38",
};

function normalizeStateKey(state: string) {
  return state.trim().toLowerCase().replace(/&/g, "and");
}

export function getStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  const key = normalizeStateKey(state);
  if (STATE_CODES[key]) return STATE_CODES[key];
  const match = Object.keys(STATE_CODES).find(
    (k) => key.includes(k) || k.includes(key),
  );
  return match ? STATE_CODES[match] : null;
}

/** Buyer state is free-text at checkout — fuzzy, tolerant match against the
 * seller's registered state (Haryana) to decide CGST+SGST vs IGST. */
export function isIntraState(buyerState: string | null | undefined): boolean {
  if (!buyerState) return false;
  return normalizeStateKey(buyerState).includes("haryana");
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Splits a GST-inclusive amount into its taxable value and tax component. */
function splitInclusiveTax(inclusiveAmount: number) {
  const taxableValue = round2(inclusiveAmount / (1 + GST_RATE / 100));
  const taxAmount = round2(inclusiveAmount - taxableValue);
  return { taxableValue, taxAmount };
}

export interface HsnTaxLine {
  hsn: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface OrderTaxBreakdown {
  orderId: string;
  orderDate: string;
  intraState: boolean;
  buyerState: string | null;
  buyerStateCode: string | null;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  invoiceValue: number;
  hsnLines: HsnTaxLine[];
}

/**
 * Same math as lib/invoice.tsx's InvoiceDocument: pro-rate the order-level
 * coupon discount across line items, split each GST-inclusive line (plus
 * shipping/convenience/COD, which are taxed as incidental charges under
 * Sec. 15(2)(c)) into taxable value + CGST/SGST or IGST, and group by HSN.
 */
export function computeOrderTax(
  order: Order,
  hsnByProductId: Map<string, string | null>,
): OrderTaxBreakdown {
  const buyerState = order.delivery_address?.state ?? null;
  const intraState = isIntraState(buyerState);
  const buyerStateCode = getStateCode(buyerState);

  const items = order.items ?? [];
  const subtotal =
    order.subtotal_amount ??
    items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const couponDiscount = round2(order.coupon_discount_amount ?? 0);
  const discountRatio =
    subtotal > 0 ? Math.max(0, (subtotal - couponDiscount) / subtotal) : 1;

  const hsnLines: HsnTaxLine[] = [];
  const addToHsn = (
    hsn: string,
    taxableValue: number,
    cgst: number,
    sgst: number,
    igst: number,
    total: number,
  ) => {
    const existing = hsnLines.find((row) => row.hsn === hsn);
    if (existing) {
      existing.taxableValue = round2(existing.taxableValue + taxableValue);
      existing.cgst = round2(existing.cgst + cgst);
      existing.sgst = round2(existing.sgst + sgst);
      existing.igst = round2(existing.igst + igst);
      existing.total = round2(existing.total + total);
    } else {
      hsnLines.push({ hsn, taxableValue, cgst, sgst, igst, total });
    }
  };

  let goodsTaxable = 0;
  let goodsCgst = 0;
  let goodsSgst = 0;
  let goodsIgst = 0;
  let goodsTotal = 0;

  for (const item of items) {
    const amount = round2(item.price * item.quantity);
    const lineTotal = round2(amount * discountRatio);
    const { taxableValue, taxAmount } = splitInclusiveTax(lineTotal);
    const cgst = intraState ? round2(taxAmount / 2) : 0;
    const sgst = intraState ? round2(taxAmount - cgst) : 0;
    const igst = intraState ? 0 : taxAmount;
    const hsn = hsnByProductId.get(String(item.id)) ?? "-";

    goodsTaxable = round2(goodsTaxable + taxableValue);
    goodsCgst = round2(goodsCgst + cgst);
    goodsSgst = round2(goodsSgst + sgst);
    goodsIgst = round2(goodsIgst + igst);
    goodsTotal = round2(goodsTotal + lineTotal);

    addToHsn(hsn, taxableValue, cgst, sgst, igst, lineTotal);
  }

  // Shipping, convenience and COD charges are incidental to the supply of
  // goods and taxed at the same rate — grouped under a synthetic "charges"
  // pseudo-HSN row rather than merged into a product's HSN line.
  const shipping = round2(order.shipping_amount ?? 0);
  const convenienceFee = round2(order.convenience_fee_amount ?? 0);
  const codFee = round2(order.cod_amount ?? 0);
  const ancillaryAmount = round2(shipping + convenienceFee + codFee);

  let ancillaryTaxable = 0;
  let ancillaryCgst = 0;
  let ancillarySgst = 0;
  let ancillaryIgst = 0;

  if (ancillaryAmount > 0) {
    const { taxableValue, taxAmount } = splitInclusiveTax(ancillaryAmount);
    const cgst = intraState ? round2(taxAmount / 2) : 0;
    const sgst = intraState ? round2(taxAmount - cgst) : 0;
    const igst = intraState ? 0 : taxAmount;
    ancillaryTaxable = taxableValue;
    ancillaryCgst = cgst;
    ancillarySgst = sgst;
    ancillaryIgst = igst;
    addToHsn("Charges", taxableValue, cgst, sgst, igst, ancillaryAmount);
  }

  const taxableValue = round2(goodsTaxable + ancillaryTaxable);
  const cgst = round2(goodsCgst + ancillaryCgst);
  const sgst = round2(goodsSgst + ancillarySgst);
  const igst = round2(goodsIgst + ancillaryIgst);
  const totalTax = round2(cgst + sgst + igst);
  const invoiceValue = round2(goodsTotal + ancillaryAmount);

  return {
    orderId: order.id,
    orderDate: new Date(order.created_at).toLocaleDateString(),
    intraState,
    buyerState,
    buyerStateCode,
    taxableValue,
    cgst,
    sgst,
    igst,
    totalTax,
    invoiceValue,
    hsnLines,
  };
}

export interface StateTaxRow {
  state: string;
  stateCode: string | null;
  orders: number;
  taxableValue: number;
  totalTax: number;
}

export interface GstSummary {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  intraStateOrders: number;
  interStateOrders: number;
  hsnSummary: HsnTaxLine[];
  stateSummary: StateTaxRow[];
}

/** Cancelled orders represent no completed supply, so — same convention as
 * computeSalesSummary in salesReport.ts — they're excluded from turnover. */
export function computeGstSummary(
  orders: Order[],
  hsnByProductId: Map<string, string | null>,
): GstSummary {
  const activeOrders = orders.filter((o) => o.status !== "cancelled");
  const breakdowns = activeOrders.map((order) =>
    computeOrderTax(order, hsnByProductId),
  );

  let taxableValue = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let intraStateOrders = 0;
  let interStateOrders = 0;
  const hsnSummary: HsnTaxLine[] = [];
  const stateMap = new Map<string, StateTaxRow>();

  for (const b of breakdowns) {
    taxableValue = round2(taxableValue + b.taxableValue);
    cgst = round2(cgst + b.cgst);
    sgst = round2(sgst + b.sgst);
    igst = round2(igst + b.igst);
    if (b.intraState) intraStateOrders += 1;
    else interStateOrders += 1;

    for (const line of b.hsnLines) {
      const existing = hsnSummary.find((row) => row.hsn === line.hsn);
      if (existing) {
        existing.taxableValue = round2(existing.taxableValue + line.taxableValue);
        existing.cgst = round2(existing.cgst + line.cgst);
        existing.sgst = round2(existing.sgst + line.sgst);
        existing.igst = round2(existing.igst + line.igst);
        existing.total = round2(existing.total + line.total);
      } else {
        hsnSummary.push({ ...line });
      }
    }

    const stateLabel = b.buyerState ?? "Unknown";
    const existingState = stateMap.get(stateLabel);
    if (existingState) {
      existingState.orders += 1;
      existingState.taxableValue = round2(existingState.taxableValue + b.taxableValue);
      existingState.totalTax = round2(existingState.totalTax + b.totalTax);
    } else {
      stateMap.set(stateLabel, {
        state: stateLabel,
        stateCode: b.buyerStateCode,
        orders: 1,
        taxableValue: b.taxableValue,
        totalTax: b.totalTax,
      });
    }
  }

  return {
    taxableValue,
    cgst,
    sgst,
    igst,
    totalTax: round2(cgst + sgst + igst),
    intraStateOrders,
    interStateOrders,
    hsnSummary: hsnSummary.sort((a, b) => b.total - a.total),
    stateSummary: Array.from(stateMap.values()).sort(
      (a, b) => b.taxableValue - a.taxableValue,
    ),
  };
}
