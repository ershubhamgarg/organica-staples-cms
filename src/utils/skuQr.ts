import QRCode from "qrcode";
import brandMarkAsset from "../assets/annvriksh-mark.png";

/**
 * Generates the operational SKU QR code used on printed pack labels.
 *
 * The payload is the SKU as plain text — nothing else. No JSON envelope, no
 * URL, no product metadata: a scanner should decode it to exactly the SKU
 * string, since that's the only thing api/orders/packing/scan.ts ever reads
 * from a scan. This is deliberately a different QR than any customer-facing
 * one on the storefront (which encode product page URLs) — an operational
 * label scanned at the packing desk must never resolve to a webpage.
 */
export function buildSkuQrPayload(sku: string): string {
  return sku;
}

const QR_OPTIONS: QRCode.QRCodeToDataURLOptions = {
  errorCorrectionLevel: "M",
  margin: 4, // quiet zone — undersized margins are a common real-world scan-failure cause
  color: { dark: "#000000", light: "#ffffff" }, // max contrast, not the brand palette
  width: 320,
};

export async function generateSkuQrPngDataUrl(sku: string, width = QR_OPTIONS.width): Promise<string> {
  return QRCode.toDataURL(buildSkuQrPayload(sku), { ...QR_OPTIONS, width });
}

export async function generateSkuQrSvg(sku: string): Promise<string> {
  return QRCode.toString(buildSkuQrPayload(sku), {
    type: "svg",
    errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel,
    margin: QR_OPTIONS.margin,
    color: QR_OPTIONS.color,
  });
}

export type SkuLabelInfo = {
  sku: string;
  /** Bare product name — do NOT include the pack size here (e.g. "...— 200
   * gms"); `weight` below is its own line, and a label showing the pack
   * size twice was the exact bug this type's callers had before. */
  name: string;
  weight?: string | null;
  /** MRP in rupees (the undiscounted list price, not the current selling
   * price — a discount is a temporary promotion, and a printed label isn't
   * reprinted every time one starts or ends). Formatted here, not passed
   * pre-formatted, so this stays the one place that decides how a label
   * prints a price. */
  price?: number | null;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load an image for the label."));
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const LABEL_PADDING = 28;
const LABEL_QR_SIZE = 280;
const LABEL_TEXT_AREA_WIDTH = 380;
const LABEL_NAME_LINE_HEIGHT = 34;
const LABEL_DETAIL_LINE_HEIGHT = 30;
const LABEL_BRAND_ROW_HEIGHT = 26;
// Every coordinate/size constant above is in logical (CSS-pixel-equivalent)
// units — the canvas is actually rendered at this many times that
// resolution (see ctx.scale below), the same technique a browser uses for
// devicePixelRatio > 1 screens. Without it, the exported PNG is only ~770px
// wide natively, which looks soft printed at real label size or zoomed in
// on a phone — this is what made everything, not just the logo, look
// low-res rather than a sharp, print-ready image.
const LABEL_SCALE = 3;

/**
 * Renders a downloadable/printable label: the SKU's QR code, the ANNVRIKSH
 * brand mark, and the product name/pack size/MRP/SKU — meant to go directly
 * on a physical product pack, not just an internal reference image. Content
 * is vertically centered as a whole block (both the QR and the text
 * column), not top-aligned, so it reads as a deliberately designed label
 * rather than two things stacked at the top of a box.
 */
export async function generateSkuLabelPngDataUrl(info: SkuLabelInfo): Promise<string> {
  const [qrImage, logoImage] = await Promise.all([
    // Generated at its actual on-canvas pixel size (not the shared 320px
    // default) — drawing a lower-resolution source image scaled *up* would
    // blur the QR itself no matter how high-DPI the surrounding canvas is.
    generateSkuQrPngDataUrl(info.sku, LABEL_QR_SIZE * LABEL_SCALE).then(loadImage),
    loadImage(brandMarkAsset),
  ]);

  // Measured on a throwaway context first (font metrics don't depend on the
  // canvas's actual pixel size) so the real canvas can be sized to fit the
  // content — and both the QR and the text column can be centered within
  // whichever of the two ends up taller.
  const measureCtx = document.createElement("canvas").getContext("2d")!;
  const textMaxWidth = LABEL_TEXT_AREA_WIDTH - LABEL_PADDING;

  measureCtx.font = "bold 28px sans-serif";
  const nameLines = wrapLines(measureCtx, info.name, textMaxWidth);
  const nameBlockHeight = nameLines.length * LABEL_NAME_LINE_HEIGHT;

  const detailCount = (info.weight ? 1 : 0) + (info.price != null ? 1 : 0);
  const detailBlockHeight = detailCount * LABEL_DETAIL_LINE_HEIGHT;

  const GAP_BRAND_TO_NAME = 12;
  const GAP_NAME_TO_DETAILS = 8;
  const GAP_DETAILS_TO_SKU = 14;
  const SKU_LINE_HEIGHT = 30;

  const textBlockHeight =
    LABEL_BRAND_ROW_HEIGHT +
    GAP_BRAND_TO_NAME +
    nameBlockHeight +
    GAP_NAME_TO_DETAILS +
    detailBlockHeight +
    GAP_DETAILS_TO_SKU +
    SKU_LINE_HEIGHT;

  const canvasHeight = Math.max(LABEL_QR_SIZE, textBlockHeight) + LABEL_PADDING * 2;
  const canvasWidth = LABEL_PADDING * 3 + LABEL_QR_SIZE + LABEL_TEXT_AREA_WIDTH;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth * LABEL_SCALE;
  canvas.height = canvasHeight * LABEL_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the label image.");

  // Every draw call below uses the logical (unscaled) coordinates computed
  // above — this maps them onto the higher-resolution physical canvas.
  ctx.scale(LABEL_SCALE, LABEL_SCALE);
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // QR, vertically centered in the full label height.
  ctx.drawImage(qrImage, LABEL_PADDING, (canvasHeight - LABEL_QR_SIZE) / 2, LABEL_QR_SIZE, LABEL_QR_SIZE);

  // Text column, vertically centered as one block.
  const textX = LABEL_PADDING * 2 + LABEL_QR_SIZE;
  let y = (canvasHeight - textBlockHeight) / 2;

  ctx.drawImage(logoImage, textX, y, LABEL_BRAND_ROW_HEIGHT, LABEL_BRAND_ROW_HEIGHT);
  ctx.fillStyle = "#5b5347";
  ctx.font = "bold 13px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("ANNVRIKSH", textX + LABEL_BRAND_ROW_HEIGHT + 8, y + LABEL_BRAND_ROW_HEIGHT / 2);
  ctx.textBaseline = "alphabetic";
  y += LABEL_BRAND_ROW_HEIGHT + GAP_BRAND_TO_NAME;

  ctx.fillStyle = "#111111";
  ctx.font = "bold 28px sans-serif";
  for (const line of nameLines) {
    ctx.fillText(line, textX, y + 24);
    y += LABEL_NAME_LINE_HEIGHT;
  }
  y += GAP_NAME_TO_DETAILS;

  ctx.font = "22px sans-serif";
  if (info.weight) {
    ctx.fillText(info.weight, textX, y + 17);
    y += LABEL_DETAIL_LINE_HEIGHT;
  }
  if (info.price != null) {
    ctx.fillText(`MRP ₹${info.price.toFixed(2)}`, textX, y + 17);
    y += LABEL_DETAIL_LINE_HEIGHT;
  }

  y += GAP_DETAILS_TO_SKU;
  ctx.font = "24px monospace";
  ctx.fillText(info.sku, textX, y + 20);

  return canvas.toDataURL("image/png");
}
