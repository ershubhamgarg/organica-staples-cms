import jsPDF, { GState } from "jspdf";
import { generateSkuQrPngDataUrl, type SkuLabelInfo } from "./skuQr";
import brandMarkAsset from "../assets/annvriksh-mark.png";

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

const CELL_WIDTH_MM = (A4_WIDTH_MM - MARGIN_MM * 2) / COLS;
const CELL_HEIGHT_MM = (A4_HEIGHT_MM - MARGIN_MM * 2) / ROWS;

/** Each label cell's actual printed size, in cm — exported so the UI can
 * show it (e.g. "each label prints at 6.5 x 2.8 cm") without duplicating
 * this arithmetic or letting it silently drift out of sync with the real
 * layout below. */
export const LABEL_CELL_WIDTH_CM = CELL_WIDTH_MM / 10;
export const LABEL_CELL_HEIGHT_CM = CELL_HEIGHT_MM / 10;

// jsPDF's built-in fonts have no glyph for ₹ (U+20B9) — same limitation
// already documented in utils/salesReportPdf.ts. "Rs." avoids the
// missing-character box without embedding a custom font just for this.
const money = (value: number) => `Rs. ${value.toFixed(2)}`;

const CROP_MARK_LENGTH_MM = 2.5;
const CROP_MARK_GAP_MM = 0.6; // clearance from the actual corner point

/**
 * Draws a single corner crop mark: two short hairlines, one horizontal and
 * one vertical, pointing outward (away from the label) from a corner point
 * — the standard printer's cut-mark convention, not a solid box around each
 * label. dirX/dirY pick which quadrant the mark points into.
 */
function drawCropMark(doc: jsPDF, x: number, y: number, dirX: 1 | -1, dirY: 1 | -1) {
  doc.line(x + dirX * CROP_MARK_GAP_MM, y, x + dirX * (CROP_MARK_GAP_MM + CROP_MARK_LENGTH_MM), y);
  doc.line(x, y + dirY * CROP_MARK_GAP_MM, x, y + dirY * (CROP_MARK_GAP_MM + CROP_MARK_LENGTH_MM));
}

/** Crop marks at all four corners of one cell — "on all sides," as asked
 * for, meaning every edge of the label gets a cut guide at both its ends,
 * not just a single mark. Adjacent cells' marks land on the same shared
 * corner point and simply overlap, which is normal on a real cut sheet. */
function drawCellCropMarks(doc: jsPDF, cellX: number, cellY: number, cellWidth: number, cellHeight: number) {
  drawCropMark(doc, cellX, cellY, -1, -1); // top-left
  drawCropMark(doc, cellX + cellWidth, cellY, 1, -1); // top-right
  drawCropMark(doc, cellX, cellY + cellHeight, -1, 1); // bottom-left
  drawCropMark(doc, cellX + cellWidth, cellY + cellHeight, 1, 1); // bottom-right
}

/** Fetches a same-origin/bundled image (e.g. a Vite-imported asset URL) as a
 * data URL — jsPDF's addImage needs actual image data, not a bare URL, when
 * running against a local asset path rather than a data: URI it already
 * has (as generateSkuQrPngDataUrl's result already is). */
async function loadImageAsDataUrl(src: string): Promise<string> {
  const response = await fetch(src);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not load the brand mark image."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Builds a printable A4 PDF of SKU labels laid out in a fixed 3x10 grid,
 * paginating every 30 rows onto its own sheet. Each cell gets its own QR
 * code plus product name / pack size / MRP / SKU — meant to be printed onto
 * a sheet of blank product-label stickers and cut apart.
 */
export async function generateSkuLabelSheetPdf(rows: SkuLabelInfo[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const cellWidth = CELL_WIDTH_MM;
  const cellHeight = CELL_HEIGHT_MM;
  const qrSize = Math.min(cellWidth * 0.34, cellHeight - 4);
  const cellPadding = 2;
  const sizeCaption = `Each label: ${LABEL_CELL_WIDTH_CM.toFixed(1)} x ${LABEL_CELL_HEIGHT_CM.toFixed(1)} cm`;
  // Loaded once, not per cell — it's the same image drawn on all 30 cells
  // of every sheet.
  const brandMarkDataUrl = await loadImageAsDataUrl(brandMarkAsset);
  // Sized against the text region specifically (right of the QR), not the
  // whole cell — centering it across the entire label put it directly
  // behind the QR code too, competing with it rather than sitting quietly
  // on the label's right side, in the text column's own space.
  const textRegionWidth = cellWidth - cellPadding * 2 - qrSize - 2;
  const watermarkSize = Math.min(textRegionWidth * 0.95, cellHeight * 0.92);

  for (let pageStart = 0; pageStart < rows.length; pageStart += PER_PAGE) {
    if (pageStart > 0) doc.addPage();
    const pageRows = rows.slice(pageStart, pageStart + PER_PAGE);

    for (let i = 0; i < pageRows.length; i++) {
      const row = pageRows[i];
      const col = i % COLS;
      const rowIdx = Math.floor(i / COLS);
      const cellX = MARGIN_MM + col * cellWidth;
      const cellY = MARGIN_MM + rowIdx * cellHeight;

      // Faint full outline (the actual cut line) plus the corner crop marks
      // (the printer's registration ticks) — both together, not one instead
      // of the other.
      doc.setDrawColor(210);
      doc.setLineWidth(0.1);
      doc.rect(cellX, cellY, cellWidth, cellHeight);

      doc.setDrawColor(80);
      doc.setLineWidth(0.15);
      drawCellCropMarks(doc, cellX, cellY, cellWidth, cellHeight);

      // The brand mark as a very light background watermark, hugging the
      // right edge of the label (vertically centered) — drawn before the
      // QR/text so it sits underneath them, at low opacity via jsPDF's
      // GState so it reads as a faint background texture rather than a
      // competing graphic. This was present on the downloadable PNG label
      // (generateSkuLabelPngDataUrl) but missing from this PDF sheet.
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.07 }));
      doc.addImage(
        brandMarkDataUrl,
        "PNG",
        cellX + cellWidth - cellPadding - watermarkSize,
        cellY + (cellHeight - watermarkSize) / 2,
        watermarkSize,
        watermarkSize,
      );
      doc.restoreGraphicsState();

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

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(130);
    doc.text(sizeCaption, A4_WIDTH_MM / 2, A4_HEIGHT_MM - 4, { align: "center" });
  }

  return doc;
}
