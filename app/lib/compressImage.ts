/** Client-side image processing: decode, convert, compress, with HEIC support. */

const SUPPORTED_FORMATS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const RAW_MAX_BYTES = 25 * 1024 * 1024;
const COMPRESSED_MAX_BYTES = 2 * 1024 * 1024;
const SKIP_COMPRESS_BYTES = 200_000;
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.78;

const BITMAP_OPTS: ImageBitmapOptions = { imageOrientation: "from-image" };

async function decodeToImageBitmap(file: File): Promise<ImageBitmap> {
  // Safari natively decodes HEIC; Chrome/Firefox need the polyfill path
  try {
    return await createImageBitmap(file, BITMAP_OPTS);
  } catch {
    if ((file.type === "image/heic" || file.type === "image/heif") && typeof window !== "undefined") {
      const heic2any = (await import("heic2any")).default;
      const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      if (!result) throw new Error("Unable to process this image");
      const single = Array.isArray(result) ? result[0] : result;
      if (!single) throw new Error("Unable to process this image");
      return await createImageBitmap(single, BITMAP_OPTS);
    }
    throw new Error("Unable to process this image");
  }
}

async function canvasToFile(
  source: ImageBitmap,
  originalName: string,
  quality: number,
): Promise<File> {
  let w = source.width;
  let h = source.height;
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to process this image");

  // White background for transparent images
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Unable to process this image"));
        const name = originalName.replace(/\.[^.]+$/, ".jpg");
        resolve(new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }));
      },
      "image/jpeg",
      quality,
    );
  });
}

export type CompressResult =
  | { ok: true; file: File }
  | { ok: false; error: string };

export async function compressImage(file: File): Promise<CompressResult> {
  // 1. Validate MIME
  if (!SUPPORTED_FORMATS.includes(file.type)) {
    return { ok: false, error: "Unsupported file type" };
  }

  // 2. Raw file safety ceiling
  if (file.size > RAW_MAX_BYTES) {
    return { ok: false, error: "This file is too large to process. Please select an image under 25MB." };
  }

  // 3. Decode
  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeToImageBitmap(file);
  } catch {
    return { ok: false, error: "Unable to process this image" };
  }

  try {
    // 4. If already small JPEG, skip compression
    if (file.size < SKIP_COMPRESS_BYTES && file.type === "image/jpeg") {
      bitmap.close();
      return { ok: true, file };
    }

    // 5. Compress to JPEG
    const compressed = await canvasToFile(bitmap, file.name, JPEG_QUALITY);

    // 6. Retry a small, bounded number of quality levels before rejecting.
    if (compressed.size > COMPRESSED_MAX_BYTES) {
      const fallback = await canvasToFile(bitmap, file.name, 0.62);
      if (fallback.size > COMPRESSED_MAX_BYTES) {
        const finalAttempt = await canvasToFile(bitmap, file.name, 0.48);
        bitmap.close();
        if (finalAttempt.size > COMPRESSED_MAX_BYTES) {
          return { ok: false, error: "Compressed image is still larger than 2MB" };
        }
        return { ok: true, file: finalAttempt };
      }
      bitmap.close();
      return { ok: true, file: fallback };
    }

    bitmap.close();
    return { ok: true, file: compressed };
  } catch {
    try { bitmap.close(); } catch { /* ok */ }
    return { ok: false, error: "Unable to process this image" };
  }
}
