import jsPDF from "jspdf";
import { generateSkuQrPngDataUrl, type SkuLabelInfo } from "./skuQr";

// A 3-column x 10-row grid (30 labels per A4 sheet) — a common sticker-sheet
// layout size for product labels, per the request this was built for.
const COLS = 3;
const ROWS = 10;
const PER_PAGE = COLS * ROWS;
/** How many label slots one A4 sheet holds — exported so callers (deciding
 * how many copies of each selected SKU to generate) can fill a sheet
 * completely rather than leaving blank cells on it. */
export const LABEL_SHEET_CAPACITY = PER_PAGE;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 8;

// jsPDF's built-in fonts have no glyph for ₹ (U+20B9) — same limitation
// already documented in utils/salesReportPdf.ts. "Rs." avoids the
// missing-character box without embedding a custom font just for this.
const money = (value: number) => `Rs. ${value.toFixed(2)}`;

/**
 * Builds a printable A4 PDF of SKU labels laid out in a fixed 3x10 grid,
 * paginating every 30 rows onto its own sheet. Each cell gets its own QR
 * code plus product name / pack size / MRP / SKU — meant to be printed onto
 * a sheet of blank product-label stickers and cut apart.
 */
export async function generateSkuLabelSheetPdf(rows: SkuLabelInfo[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const usableWidth = A4_WIDTH_MM - MARGIN_MM * 2;
  const usableHeight = A4_HEIGHT_MM - MARGIN_MM * 2;
  const cellWidth = usableWidth / COLS;
  const cellHeight = usableHeight / ROWS;
  const qrSize = Math.min(cellWidth * 0.34, cellHeight - 4);
  const cellPadding = 2;

  for (let pageStart = 0; pageStart < rows.length; pageStart += PER_PAGE) {
    if (pageStart > 0) doc.addPage();
    const pageRows = rows.slice(pageStart, pageStart + PER_PAGE);

    for (let i = 0; i < pageRows.length; i++) {
      const row = pageRows[i];
      const col = i % COLS;
      const rowIdx = Math.floor(i / COLS);
      const cellX = MARGIN_MM + col * cellWidth;
      const cellY = MARGIN_MM + rowIdx * cellHeight;

      // Faint cut-guide border — not meant to print dark, just to show
      // where one label ends and the next begins on the sheet.
      doc.setDrawColor(210);
      doc.rect(cellX, cellY, cellWidth, cellHeight);

      const qrDataUrl = await generateSkuQrPngDataUrl(row.sku, 300);
      const qrY = cellY + (cellHeight - qrSize) / 2;
      doc.addImage(qrDataUrl, "PNG", cellX + cellPadding, qrY, qrSize, qrSize);

      const textX = cellX + cellPadding + qrSize + 2;
      const textMaxWidth = cellWidth - cellPadding * 2 - qrSize - 2;

      // Vertically centered as one block against the cell height — the same
      // treatment the downloadable PNG label already gets (see
      // generateSkuLabelPngDataUrl in skuQr.ts). Previously this started
      // from a fixed offset from the cell's top regardless of content, so a
      // short label's text sat noticeably higher than its QR code (which
      // *is* centered) instead of lining up with it.
      const NAME_LINE_HEIGHT = 2.6;
      const DETAIL_LINE_HEIGHT = 2.3;
      const GAP_BEFORE_SKU = 1;
      const SKU_LINE_HEIGHT = 2.5;
      const FIRST_BASELINE_OFFSET = 2; // top-of-block to first line's baseline

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      const nameLines: string[] = doc.splitTextToSize(row.name, textMaxWidth);
      const shownNameLines = nameLines.slice(0, 2);

      const detailCount = (row.weight ? 1 : 0) + (row.price != null ? 1 : 0);
      const textBlockHeight =
        shownNameLines.length * NAME_LINE_HEIGHT +
        detailCount * DETAIL_LINE_HEIGHT +
        GAP_BEFORE_SKU +
        SKU_LINE_HEIGHT;

      let textY = cellY + (cellHeight - textBlockHeight) / 2 + FIRST_BASELINE_OFFSET;

      doc.setTextColor(20);
      doc.text(shownNameLines, textX, textY);
      textY += shownNameLines.length * NAME_LINE_HEIGHT;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      if (row.weight) {
        doc.text(row.weight, textX, textY);
        textY += DETAIL_LINE_HEIGHT;
      }
      if (row.price != null) {
        doc.text(`MRP ${money(row.price)}`, textX, textY);
        textY += DETAIL_LINE_HEIGHT;
      }

      textY += GAP_BEFORE_SKU;
      doc.setFont("courier", "normal");
      doc.setFontSize(6);
      doc.text(row.sku, textX, Math.min(textY, cellY + cellHeight - 1.5));
    }
  }

  return doc;
}
