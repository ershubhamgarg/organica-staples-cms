import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency } from "./currency";
import { SELLER, type GstSummary, type OrderTaxBreakdown } from "./gst";

// jsPDF's built-in fonts have no glyph for ₹ (U+20B9) — it renders as a
// missing-character box. "Rs." avoids that without embedding a custom font
// just for this report; the CSV export keeps the real ₹ symbol since a
// spreadsheet has no such font limitation.
const money = (value: number) => `Rs. ${formatCurrency(value)}`;

const finalY = (doc: jsPDF) =>
  (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;

interface PdfReportInput {
  rangeLabel: string;
  totalOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  gstSummary: GstSummary;
  orderTaxBreakdowns: OrderTaxBreakdown[];
}

// This PDF is meant to go straight to a CA for GST/ITR filing, so it's
// intentionally scoped to tax-relevant figures only — no profit/loss,
// discount, payment-method, or top-product info (that's what the CSV
// export and the on-screen report are for).
export function downloadSalesReportPDF({
  rangeLabel,
  totalOrders,
  activeOrders,
  cancelledOrders,
  gstSummary,
  orderTaxBreakdowns,
}: PdfReportInput) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("ANNVRIKSH — GST Tax Report", margin, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(rangeLabel, margin, 68);
  doc.text(
    `Seller GSTIN: ${SELLER.gstin} · ${SELLER.state} (${SELLER.stateCode})`,
    margin,
    82,
  );
  doc.text(`Generated on ${new Date().toLocaleString()}`, margin, 96);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 114,
    head: [["Order Summary", "Value"]],
    body: [
      ["Total Orders", String(totalOrders)],
      ["Active Orders (Taxable Supplies)", String(activeOrders)],
      ["Cancelled Orders (Excluded)", String(cancelledOrders)],
    ],
    theme: "grid",
    headStyles: { fillColor: [17, 44, 36] },
    margin: { left: margin, right: margin },
    styles: { fontSize: 9 },
  });

  let cursorY = finalY(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("GST / Tax Summary", margin, cursorY + 24);
  doc.setFont("helvetica", "normal");

  autoTable(doc, {
    startY: cursorY + 34,
    head: [["Tax Summary", "Value"]],
    body: [
      ["Taxable Value (Turnover)", money(gstSummary.taxableValue)],
      ["CGST", money(gstSummary.cgst)],
      ["SGST", money(gstSummary.sgst)],
      ["IGST", money(gstSummary.igst)],
      ["Total GST Collected", money(gstSummary.totalTax)],
      ["Intra-State Orders (CGST+SGST)", String(gstSummary.intraStateOrders)],
      ["Inter-State Orders (IGST)", String(gstSummary.interStateOrders)],
    ],
    theme: "grid",
    headStyles: { fillColor: [197, 160, 40] },
    margin: { left: margin, right: margin },
    styles: { fontSize: 9 },
  });
  cursorY = finalY(doc);

  if (gstSummary.hsnSummary.length > 0) {
    autoTable(doc, {
      startY: cursorY + 20,
      head: [["HSN/SAC", "Taxable Value", "CGST", "SGST", "IGST", "Total"]],
      body: gstSummary.hsnSummary.map((row) => [
        row.hsn,
        money(row.taxableValue),
        money(row.cgst),
        money(row.sgst),
        money(row.igst),
        money(row.total),
      ]),
      theme: "grid",
      headStyles: { fillColor: [197, 160, 40] },
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
    });
    cursorY = finalY(doc);
  }

  if (gstSummary.stateSummary.length > 0) {
    autoTable(doc, {
      startY: cursorY + 20,
      head: [["Place of Supply", "Orders", "Taxable Value", "Total Tax"]],
      body: gstSummary.stateSummary.map((row) => [
        row.stateCode ? `${row.state} (${row.stateCode})` : row.state,
        String(row.orders),
        money(row.taxableValue),
        money(row.totalTax),
      ]),
      theme: "grid",
      headStyles: { fillColor: [197, 160, 40] },
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
    });
    cursorY = finalY(doc);
  }

  autoTable(doc, {
    startY: cursorY + 20,
    head: [
      [
        "Order",
        "Date",
        "Place of Supply",
        "Type",
        "Taxable Value",
        "CGST",
        "SGST",
        "IGST",
        "Invoice Value",
      ],
    ],
    body: orderTaxBreakdowns.map((tax) => [
      `ORD-${tax.orderId.slice(0, 8).toUpperCase()}`,
      tax.orderDate,
      tax.buyerStateCode
        ? `${tax.buyerState} (${tax.buyerStateCode})`
        : (tax.buyerState ?? "-"),
      tax.intraState ? "Intra" : "Inter",
      money(tax.taxableValue),
      money(tax.cgst),
      money(tax.sgst),
      money(tax.igst),
      money(tax.invoiceValue),
    ]),
    theme: "striped",
    headStyles: { fillColor: [17, 44, 36] },
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(
        `Page ${doc.getNumberOfPages()}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 20,
        { align: "right" },
      );
      doc.setTextColor(0);
    },
  });

  doc.save(`gst-tax-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
