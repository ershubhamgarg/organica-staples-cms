import type { Order } from "../store/orderStore";
import { getOrderGrossWeightKg } from "./weight";
import { computeOrderTax } from "./gst";

export type DatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "this_fy"
  | "last_fy"
  | "custom";

export type Granularity = "day" | "week" | "month";

export interface DateRange {
  start: Date;
  end: Date;
}

const startOfDay = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

// Monday-start week, matching typical Indian business-week conventions.
const startOfWeek = (d: Date) => {
  const copy = startOfDay(d);
  const day = copy.getDay();
  const diff = (day + 6) % 7; // 0 = Monday
  copy.setDate(copy.getDate() - diff);
  return copy;
};

export function getDateRangeForPreset(
  preset: DatePreset,
  custom?: { start: string; end: string },
): DateRange {
  const now = new Date();

  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case "last7": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { start: startOfDay(start), end: endOfDay(now) };
    }
    case "this_week":
      return { start: startOfWeek(now), end: endOfDay(now) };
    case "this_month":
      return {
        start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: endOfDay(now),
      };
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case "this_year":
      return {
        start: startOfDay(new Date(now.getFullYear(), 0, 1)),
        end: endOfDay(now),
      };
    case "this_fy": {
      // April–March Indian financial year, still in progress — ends today.
      const fyStartYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
      return {
        start: startOfDay(new Date(fyStartYear, 3, 1)),
        end: endOfDay(now),
      };
    }
    case "last_fy": {
      const currentFyStartYear =
        now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
      const fyStartYear = currentFyStartYear - 1;
      return {
        start: startOfDay(new Date(fyStartYear, 3, 1)),
        end: endOfDay(new Date(fyStartYear + 1, 2, 31)),
      };
    }
    case "custom": {
      if (!custom?.start || !custom?.end) {
        return { start: startOfDay(now), end: endOfDay(now) };
      }
      return {
        start: startOfDay(new Date(custom.start)),
        end: endOfDay(new Date(custom.end)),
      };
    }
    default:
      return { start: startOfDay(now), end: endOfDay(now) };
  }
}

export function filterOrdersByRange(
  orders: Order[],
  range: DateRange,
): Order[] {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return orders.filter((order) => {
    const created = new Date(order.created_at).getTime();
    return created >= startMs && created <= endMs;
  });
}

const isCancelled = (order: Order) => order.status === "cancelled";

export interface ProductSalesRow {
  name: string;
  quantity: number;
  revenue: number;
}

export interface SalesSummary {
  totalOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  cancelledValue: number;
  grossRevenue: number;
  totalDiscount: number;
  netRevenue: number;
  shippingCollected: number;
  extraShippingCost: number;
  convenienceFees: number;
  codCharges: number;
  wholesaleCost: number;
  totalProfit: number;
  avgOrderValue: number;
  refundedAmount: number;
  refundedCount: number;
  totalItemsSold: number;
  totalWeightKg: number;
  paymentMethodBreakdown: Record<string, { count: number; amount: number }>;
  statusBreakdown: Record<string, number>;
  topProducts: ProductSalesRow[];
}

export function computeSalesSummary(orders: Order[]): SalesSummary {
  const activeOrders = orders.filter((o) => !isCancelled(o));
  const cancelledOrders = orders.filter(isCancelled);

  const paymentMethodBreakdown: Record<string, { count: number; amount: number }> = {};
  const statusBreakdown: Record<string, number> = {};
  const productTotals = new Map<string, ProductSalesRow>();

  let grossRevenue = 0;
  let totalDiscount = 0;
  let netRevenue = 0;
  let shippingCollected = 0;
  let extraShippingCost = 0;
  let convenienceFees = 0;
  let codCharges = 0;
  let wholesaleCost = 0;
  let totalProfit = 0;
  let totalItemsSold = 0;
  let totalWeightKg = 0;

  for (const order of orders) {
    statusBreakdown[order.status] = (statusBreakdown[order.status] ?? 0) + 1;
  }

  for (const order of activeOrders) {
    grossRevenue += order.subtotal_amount ?? 0;
    totalDiscount +=
      order.discount_amount ??
      (order.product_discount_amount ?? 0) + (order.coupon_discount_amount ?? 0);
    netRevenue += order.total_amount ?? 0;
    shippingCollected += order.shipping_amount ?? 0;
    extraShippingCost += order.extra_shipping_amount ?? 0;
    convenienceFees += order.convenience_fee_amount ?? 0;
    codCharges += order.cod_amount ?? 0;
    wholesaleCost += order.wholesale_total_amount ?? 0;
    totalProfit += order.profit_loss ?? 0;
    totalWeightKg += getOrderGrossWeightKg(order.items ?? []);

    const method = order.payment_method || "unknown";
    if (!paymentMethodBreakdown[method]) {
      paymentMethodBreakdown[method] = { count: 0, amount: 0 };
    }
    paymentMethodBreakdown[method].count += 1;
    paymentMethodBreakdown[method].amount += order.total_amount ?? 0;

    for (const item of order.items ?? []) {
      totalItemsSold += item.quantity;
      const existing = productTotals.get(item.name);
      const lineRevenue = item.price * item.quantity;
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += lineRevenue;
      } else {
        productTotals.set(item.name, {
          name: item.name,
          quantity: item.quantity,
          revenue: lineRevenue,
        });
      }
    }
  }

  const cancelledValue = cancelledOrders.reduce(
    (sum, o) => sum + (o.total_amount ?? 0),
    0,
  );

  const refundedOrders = orders.filter((o) => o.refund_status === "processed");
  const refundedAmount = refundedOrders.reduce(
    (sum, o) => sum + (o.refund_amount ?? 0),
    0,
  );

  const topProducts = Array.from(productTotals.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    totalOrders: orders.length,
    activeOrders: activeOrders.length,
    cancelledOrders: cancelledOrders.length,
    cancelledValue,
    grossRevenue: round2(grossRevenue),
    totalDiscount: round2(totalDiscount),
    netRevenue: round2(netRevenue),
    shippingCollected: round2(shippingCollected),
    extraShippingCost: round2(extraShippingCost),
    convenienceFees: round2(convenienceFees),
    codCharges: round2(codCharges),
    wholesaleCost: round2(wholesaleCost),
    totalProfit: round2(totalProfit),
    avgOrderValue: activeOrders.length
      ? round2(netRevenue / activeOrders.length)
      : 0,
    refundedAmount: round2(refundedAmount),
    refundedCount: refundedOrders.length,
    totalItemsSold,
    totalWeightKg,
    paymentMethodBreakdown,
    statusBreakdown,
    topProducts,
  };
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export interface PeriodBreakdownRow extends SalesSummary {
  periodLabel: string;
  periodStart: Date;
}

function periodKey(date: Date, granularity: Granularity): string {
  if (granularity === "day") {
    return date.toISOString().slice(0, 10);
  }
  if (granularity === "week") {
    const weekStart = startOfWeek(date);
    return weekStart.toISOString().slice(0, 10);
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(date: Date, granularity: Granularity): string {
  if (granularity === "day") {
    return date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  if (granularity === "week") {
    const weekStart = startOfWeek(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return `${weekStart.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} – ${weekEnd.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}`;
  }
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function groupOrdersByPeriod(
  orders: Order[],
  granularity: Granularity,
): PeriodBreakdownRow[] {
  const buckets = new Map<string, { date: Date; orders: Order[] }>();

  for (const order of orders) {
    const created = new Date(order.created_at);
    const key = periodKey(created, granularity);
    if (!buckets.has(key)) {
      buckets.set(key, { date: created, orders: [] });
    }
    buckets.get(key)!.orders.push(order);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([, bucket]) => ({
      periodLabel: periodLabel(bucket.date, granularity),
      periodStart: bucket.date,
      ...computeSalesSummary(bucket.orders),
    }));
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function ordersToCSV(orders: Order[]): string {
  const headers = [
    "Order ID",
    "Invoice Number",
    "Date",
    "Customer",
    "Email",
    "Phone",
    "Items",
    "HSN Code(s)",
    "Subtotal",
    "Discount",
    "Shipping",
    "Convenience Fee",
    "COD Charges",
    "Total (GST Incl.)",
    "Taxable Value",
    "CGST",
    "SGST",
    "IGST",
    "Total Tax",
    "Place of Supply",
    "Supply Type",
    "Wholesale Cost",
    "Profit/Loss",
    "Payment Method",
    "Payment Status",
    "Order Status",
    "Shipping Status",
    "Refund Status",
    "Refund Amount",
    "Coupon Code",
  ];

  const rows = orders.map((order) => {
    const tax = computeOrderTax(order);
    const hsnCodes = Array.from(
      new Set(tax.hsnLines.map((line) => line.hsn).filter((h) => h !== "-")),
    ).join("; ");

    return [
      order.id,
      order.invoice_number ?? "",
      new Date(order.created_at).toLocaleString(),
      order.delivery_address?.name ?? "",
      order.delivery_address?.email ?? "",
      order.delivery_address?.phone ?? "",
      (order.items ?? []).reduce((sum, i) => sum + i.quantity, 0),
      hsnCodes,
      order.subtotal_amount ?? 0,
      order.discount_amount ??
        (order.product_discount_amount ?? 0) + (order.coupon_discount_amount ?? 0),
      order.shipping_amount ?? 0,
      order.convenience_fee_amount ?? 0,
      order.cod_amount ?? 0,
      order.total_amount ?? 0,
      tax.taxableValue,
      tax.cgst,
      tax.sgst,
      tax.igst,
      tax.totalTax,
      order.delivery_address?.state ?? "",
      tax.intraState ? "Intra-State (CGST+SGST)" : "Inter-State (IGST)",
      order.wholesale_total_amount ?? 0,
      order.profit_loss ?? 0,
      order.payment_method ?? "",
      order.payment_details?.status ?? "",
      order.status,
      order.shipping_status ?? "",
      order.refund_status ?? "",
      order.refund_amount ?? 0,
      order.discount_code ?? "",
    ];
  });

  const lines = [headers, ...rows].map((row) =>
    row.map(csvEscape).join(","),
  );
  return lines.join("\n");
}

export function downloadCSV(csv: string, filename: string) {
  // A UTF-8 BOM keeps Excel from mangling the ₹ symbol / non-ASCII names.
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
