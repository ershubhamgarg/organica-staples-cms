import * as XLSX from "xlsx";
import { SELLER, type GstSummary, type OrderTaxBreakdown } from "./gst";

interface ExcelReportInput {
  rangeLabel: string;
  totalOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  gstSummary: GstSummary;
  orderTaxBreakdowns: OrderTaxBreakdown[];
}

// Mirrors the PDF export's tax-only scope — this is the same GST report in
// an editable, multi-sheet workbook a CA can filter/pivot, rather than the
// fixed-layout PDF or the general per-order CSV (which still carries the
// full profit/discount detail the CA doesn't need).
export function downloadSalesReportExcel({
  rangeLabel,
  totalOrders,
  activeOrders,
  cancelledOrders,
  gstSummary,
  orderTaxBreakdowns,
}: ExcelReportInput) {
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["ANNVRIKSH — GST Tax Report"],
    [rangeLabel],
    [`Seller GSTIN: ${SELLER.gstin}`],
    [`Seller State: ${SELLER.state} (${SELLER.stateCode})`],
    [`Generated on: ${new Date().toLocaleString()}`],
    [],
    ["Order Summary", "Value"],
    ["Total Orders", totalOrders],
    ["Active Orders (Taxable Supplies)", activeOrders],
    ["Cancelled Orders (Excluded)", cancelledOrders],
    [],
    ["Tax Summary", "Value"],
    ["Taxable Value (Turnover)", gstSummary.taxableValue],
    ["CGST", gstSummary.cgst],
    ["SGST", gstSummary.sgst],
    ["IGST", gstSummary.igst],
    ["Total GST Collected", gstSummary.totalTax],
    ["Intra-State Orders (CGST+SGST)", gstSummary.intraStateOrders],
    ["Inter-State Orders (IGST)", gstSummary.interStateOrders],
  ]);
  summarySheet["!cols"] = [{ wch: 34 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const hsnSheet = XLSX.utils.json_to_sheet(
    gstSummary.hsnSummary.map((row) => ({
      "HSN/SAC": row.hsn,
      Description: row.description,
      Quantity: row.quantity,
      "Taxable Value": row.taxableValue,
      CGST: row.cgst,
      SGST: row.sgst,
      IGST: row.igst,
      Total: row.total,
    })),
  );
  hsnSheet["!cols"] = [
    { wch: 12 },
    { wch: 40 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, hsnSheet, "HSN Summary");

  const stateSheet = XLSX.utils.json_to_sheet(
    gstSummary.stateSummary.map((row) => ({
      "Place of Supply": row.state,
      "State Code": row.stateCode ?? "",
      Orders: row.orders,
      "Taxable Value": row.taxableValue,
      "Total Tax": row.totalTax,
    })),
  );
  stateSheet["!cols"] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, stateSheet, "State Summary");

  const orderSheet = XLSX.utils.json_to_sheet(
    orderTaxBreakdowns.map((tax) => ({
      "Order ID": `ORD-${tax.orderId.slice(0, 8).toUpperCase()}`,
      "Invoice Number": tax.invoiceNumber ?? "",
      Date: tax.orderDate,
      Customer: tax.customerName ?? "Guest",
      "Place of Supply": tax.buyerStateCode
        ? `${tax.buyerState} (${tax.buyerStateCode})`
        : (tax.buyerState ?? ""),
      "Supply Type": tax.intraState ? "Intra-State (CGST+SGST)" : "Inter-State (IGST)",
      "Taxable Value": tax.taxableValue,
      CGST: tax.cgst,
      SGST: tax.sgst,
      IGST: tax.igst,
      "Total Tax": tax.totalTax,
      "Invoice Value": tax.invoiceValue,
    })),
  );
  orderSheet["!cols"] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
    { wch: 20 },
    { wch: 22 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, orderSheet, "Order Tax Detail");

  XLSX.writeFile(
    workbook,
    `gst-tax-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
