import { describe, it, expect } from "vitest";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { buildSkuQrPayload, generateSkuQrSvg } from "./skuQr";

/** Round-trips a real generated QR code (encode -> rasterize -> decode) to
 * prove it actually decodes back to the exact SKU, per the acceptance
 * criterion — not just that our code called the library with the right
 * string. */
async function decodeGeneratedSku(sku: string): Promise<string | null> {
  const png = await QRCode.toBuffer(buildSkuQrPayload(sku), {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 320,
    type: "png",
  });
  const decoded = PNG.sync.read(png);
  const result = jsQR(
    new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length),
    decoded.width,
    decoded.height,
  );
  return result?.data ?? null;
}

describe("SKU QR generation", () => {
  it("encodes the SKU as plain text, not JSON or a URL", () => {
    expect(buildSkuQrPayload("ANN-RCP-200")).toBe("ANN-RCP-200");
    expect(buildSkuQrPayload("ANN-RCP-200")).not.toMatch(/^https?:\/\//);
    expect(buildSkuQrPayload("ANN-RCP-200")).not.toMatch(/^[{[]/);
  });

  it("decodes back to the exact SKU it was generated from", async () => {
    for (const sku of ["ANN-RCP-200", "ANN-CHIA-100", "ANN-GIFT-BOX-01"]) {
      await expect(decodeGeneratedSku(sku)).resolves.toBe(sku);
    }
  });

  it("produces valid, non-empty SVG markup for printable labels", async () => {
    const svg = await generateSkuQrSvg("ANN-RCP-200");
    expect(svg).toMatch(/<svg/);
    expect(svg.length).toBeGreaterThan(100);
  });
});
