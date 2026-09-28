import jsQR from "jsqr";

// Mobile camera photos can be huge (e.g. 4000x3000) — decoding at full
// resolution is needlessly slow for something that needs to feel instant.
// Downscaling first keeps jsQR fast without hurting decode reliability; a
// QR code doesn't need anywhere near the sensor's native resolution to read.
const MAX_DIMENSION = 1200;

/**
 * Decodes a QR code from a captured photo (see PackingScanner — the "Open
 * Camera" button launches the device's native camera app via
 * `<input capture>` rather than an embedded live-video scanner). Returns the
 * decoded text, or null if no QR code was found in the image.
 */
export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that photo."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load that photo."));
    img.src = dataUrl;
  });

  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  return result?.data ?? null;
}
