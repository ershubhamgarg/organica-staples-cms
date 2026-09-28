import QRCode from "qrcode";

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

export async function generateSkuQrPngDataUrl(sku: string): Promise<string> {
  return QRCode.toDataURL(buildSkuQrPayload(sku), QR_OPTIONS);
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
  name: string;
  weight?: string | null;
  /** Selling price in rupees — formatted here, not passed pre-formatted, so
   * this stays the one place that decides how a label prints a price. */
  price?: number | null;
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

/**
 * Renders a downloadable label PNG: the SKU's QR code alongside the same
 * product name/pack size/price/SKU text shown on a printed label — the
 * bare-QR PNG download alone didn't carry enough for someone to tell one
 * SKU's label apart from another once saved to a phone/shared over chat.
 */
export async function generateSkuLabelPngDataUrl(info: SkuLabelInfo): Promise<string> {
  const qrDataUrl = await generateSkuQrPngDataUrl(info.sku);
  const qrImage = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render the QR code image."));
    img.src = qrDataUrl;
  });

  const padding = 28;
  const qrSize = 320;
  const textAreaWidth = 380;
  const canvasWidth = padding * 3 + qrSize + textAreaWidth;
  const canvasHeight = padding * 2 + qrSize;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the label image.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(qrImage, padding, padding, qrSize, qrSize);

  const textX = padding * 2 + qrSize;
  const textMaxWidth = textAreaWidth - padding;
  let y = padding + 36;

  ctx.fillStyle = "#111111";
  ctx.font = "bold 30px sans-serif";
  y = wrapText(ctx, info.name, textX, y, textMaxWidth, 36) + 14;

  ctx.font = "24px sans-serif";
  if (info.weight) {
    ctx.fillText(info.weight, textX, y);
    y += 34;
  }
  if (info.price != null) {
    ctx.fillText(`₹${info.price.toFixed(2)}`, textX, y);
    y += 34;
  }

  ctx.font = "26px monospace";
  ctx.fillText(info.sku, textX, y + 10);

  return canvas.toDataURL("image/png");
}
