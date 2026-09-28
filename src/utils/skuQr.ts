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
