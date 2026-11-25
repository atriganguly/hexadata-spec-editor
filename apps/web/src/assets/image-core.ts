import { IMAGE_LIMITS } from '@hexadata/spec-core';

/**
 * Pure parts of the image pipeline (no DOM), shared by the worker and the main-thread fallback.
 */

export interface ImageTarget {
  widthMm: number;
  heightMm: number;
}

export interface ProcessedImage {
  hash: string;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  thumb: Blob;
}

export class ImageRejected extends Error {
  override name = 'ImageRejected';
}

/** Stored images keep 2x the slot's 300 dpi size: sharp print output and headroom if a template's slot grows. */
export const STORED_DPI = IMAGE_LIMITS.targetDpi * 2;
export const THUMB_EDGE = 96;
const MM_PER_INCH = 25.4;
const MB = 1024 * 1024;
const MAX_SOURCE_PIXELS = 200_000_000;

/** Pixel size to downscale to: fits inside the slot at STORED_DPI, never enlarges, capped at maxEdgePx. */
export function fitSize(
  width: number,
  height: number,
  target: ImageTarget,
): { width: number; height: number } {
  const maxW = Math.min(
    IMAGE_LIMITS.maxEdgePx,
    Math.ceil((target.widthMm / MM_PER_INCH) * STORED_DPI),
  );
  const maxH = Math.min(
    IMAGE_LIMITS.maxEdgePx,
    Math.ceil((target.heightMm / MM_PER_INCH) * STORED_DPI),
  );
  const scale = Math.min(1, maxW / width, maxH / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function checkSource(file: Blob): void {
  if (file.type === 'image/svg+xml')
    throw new ImageRejected('SVG images are not supported. Use PNG, JPEG or WebP.');
  if (file.size === 0) throw new ImageRejected('The file is empty.');
  if (file.size > IMAGE_LIMITS.inputBytes) {
    throw new ImageRejected(`The image is larger than ${IMAGE_LIMITS.inputBytes / MB} MB.`);
  }
}

export function checkDecoded(width: number, height: number): void {
  if (width < 1 || height < 1) throw new ImageRejected('The image has no size.');
  if (width * height > MAX_SOURCE_PIXELS) throw new ImageRejected('The image has too many pixels.');
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Encoder: WebP where the browser can, PNG otherwise. */
export interface Encoder {
  encode(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob>;
}

/** Decode -> downscale -> encode -> hash. Retries smaller if the result is over the stored-size limit. */
export async function processWith(
  file: Blob,
  target: ImageTarget,
  decode: (file: Blob) => Promise<ImageBitmap>,
  encoder: Encoder,
): Promise<ProcessedImage> {
  checkSource(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new ImageRejected('That file could not be read as an image.');
  }
  try {
    checkDecoded(bitmap.width, bitmap.height);
    let { width, height } = fitSize(bitmap.width, bitmap.height, target);
    let blob = await encoder.encode(bitmap, width, height, 0.92);
    for (let attempt = 0; blob.size > IMAGE_LIMITS.storedBytes && attempt < 4; attempt += 1) {
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
      blob = await encoder.encode(bitmap, width, height, 0.8);
    }
    if (blob.size > IMAGE_LIMITS.storedBytes)
      throw new ImageRejected('The image is too large even after resizing.');

    const thumbScale = Math.min(1, THUMB_EDGE / Math.max(width, height));
    const thumb = await encoder.encode(
      bitmap,
      Math.max(1, Math.round(width * thumbScale)),
      Math.max(1, Math.round(height * thumbScale)),
      0.8,
    );
    return {
      hash: await sha256Hex(blob),
      blob,
      mime: blob.type,
      width,
      height,
      bytes: blob.size,
      thumb,
    };
  } finally {
    bitmap.close();
  }
}
