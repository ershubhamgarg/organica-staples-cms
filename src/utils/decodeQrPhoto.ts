import jsQR from "jsqr";

// A QR label photographed at a normal working distance (not filling the
// frame) only occupies a small fraction of the photo — aggressively
// downscaling the *whole* photo for decode speed also shrinks that small
// region below the resolution jsQR needs to find it, which is the actual
// cause of "the camera opens but never scans". This is a one-shot decode
// triggered by a deliberate user action (not a real-time preview), so a
// second or two is an acceptable cost for reliability: try a generous size
// first, then fall back to the photo's true native resolution before
// giving up.
const GENEROUS_MAX_DIMENSION = 2400;
// A hard ceiling only to bound truly extreme sensor resolutions (a modern
// phone's max photo can exceed this) — still large enough that a QR label
// keeps plenty of detail even from a few feet away.
const HARD_MAX_DIMENSION = 4000;

async function loadAsCanvas(file: File): Promise<HTMLCanvasElement> {
  // createImageBitmap with imageOrientation: "from-image" is what makes this
  // respect the photo's EXIF rotation — without it, a portrait phone photo
  // can come out sideways once drawn to a canvas, which throws jsQR off just
  // as much as it would a human. Falls back to a plain <img> for browsers
  // that don't support the option (the image is usually already
  // auto-rotated by the browser in that case anyway).
  let bitmapLike: ImageBitmap | HTMLImageElement;
  try {
    bitmapLike = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("Could not read that photo."));
      reader.readAsDataURL(file);
    });
    bitmapLike = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load that photo."));
      img.src = dataUrl;
    });
  }

  const naturalWidth = "naturalWidth" in bitmapLike ? bitmapLike.naturalWidth : bitmapLike.width;
  const naturalHeight = "naturalHeight" in bitmapLike ? bitmapLike.naturalHeight : bitmapLike.height;

  const canvas = document.createElement("canvas");
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that photo.");
  ctx.drawImage(bitmapLike, 0, 0, naturalWidth, naturalHeight);
  return canvas;
}

function decodeAtSize(source: HTMLCanvasElement, maxDimension: number): string | null {
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  let target = source;
  if (scale < 1) {
    target = document.createElement("canvas");
    target.width = width;
    target.height = height;
    const targetCtx = target.getContext("2d");
    if (!targetCtx) return null;
    targetCtx.drawImage(source, 0, 0, width, height);
  }

  const ctx = target.getContext("2d");
  if (!ctx) return null;
  const imageData = ctx.getImageData(0, 0, target.width, target.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  return result?.data ?? null;
}

/**
 * Decodes a QR code from a captured photo (see PackingScanner — the "Open
 * Camera" button launches the device's native camera app via
 * `<input capture>` rather than an embedded live-video scanner). Returns the
 * decoded text, or null if no QR code was found in the image at all.
 */
export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const canvas = await loadAsCanvas(file);

  // Try a generous-but-bounded size first (fast, and enough detail for most
  // shots); if that fails, retry at the photo's true native resolution
  // (capped only against extreme sensor sizes) — catches a QR that occupied
  // a small part of the frame and needed the resolution the downscale threw
  // away.
  return (
    decodeAtSize(canvas, GENEROUS_MAX_DIMENSION) ??
    decodeAtSize(canvas, HARD_MAX_DIMENSION)
  );
}
