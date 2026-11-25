import { IMAGE_LIMITS } from './limits.ts';

export type ImageMime = (typeof IMAGE_LIMITS.mimeTypes)[number];

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
}

const be16 = (b: Uint8Array, o: number) => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const be32 = (b: Uint8Array, o: number) =>
  (((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0)) >>> 0;
const le16 = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const le24 = (b: Uint8Array, o: number) =>
  (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);

const startsWith = (b: Uint8Array, bytes: number[], offset = 0) =>
  bytes.every((value, index) => b[offset + index] === value);

const ascii = (b: Uint8Array, o: number, length: number) =>
  String.fromCharCode(...Array.from(b.subarray(o, o + length)));

function pngInfo(b: Uint8Array): ImageInfo | null {
  // 8-byte signature, then the IHDR chunk: length(4) "IHDR"(4) width(4) height(4)
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return { mime: 'image/png', width: be32(b, 16), height: be32(b, 20) };
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegInfo(b: Uint8Array): ImageInfo | null {
  let offset = 2;
  while (offset + 4 < b.length) {
    if (b[offset] !== 0xff) return null;
    while (b[offset] === 0xff) offset += 1; // fill bytes
    const marker = b[offset];
    offset += 1;
    if (marker === undefined) return null;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // no payload
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan before any frame header
    const length = be16(b, offset);
    if (length < 2) return null;
    if (SOF_MARKERS.has(marker)) {
      if (offset + 7 > b.length) return null;
      return { mime: 'image/jpeg', height: be16(b, offset + 3), width: be16(b, offset + 5) };
    }
    offset += length;
  }
  return null;
}

function webpInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  const data = 20;
  if (chunk === 'VP8 ') {
    if (!startsWith(b, [0x9d, 0x01, 0x2a], data + 3)) return null;
    return {
      mime: 'image/webp',
      width: le16(b, data + 6) & 0x3fff,
      height: le16(b, data + 8) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    if (b[data] !== 0x2f) return null;
    const b1 = b[data + 1] ?? 0;
    const b2 = b[data + 2] ?? 0;
    const b3 = b[data + 3] ?? 0;
    const b4 = b[data + 4] ?? 0;
    return {
      mime: 'image/webp',
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    };
  }
  if (chunk === 'VP8X') {
    return { mime: 'image/webp', width: 1 + le24(b, data + 4), height: 1 + le24(b, data + 7) };
  }
  return null;
}

/**
 * Identifies PNG, JPEG and WebP by their magic bytes and reads the pixel size from the header, without
 * decoding. Returns null for anything else or for truncated/odd files. Used to reject disguised files and
 * decompression bombs before an image ever reaches a decoder.
 */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return pngInfo(bytes);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return jpegInfo(bytes);
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46])) return webpInfo(bytes);
  return null;
}

export type ImageCheck = { ok: true; info: ImageInfo } | { ok: false; reason: string };

/** Full acceptance check for an uploaded image: type, size, dimensions and pixel count. */
export function checkImage(bytes: Uint8Array): ImageCheck {
  if (bytes.byteLength === 0) return { ok: false, reason: 'The image is empty.' };
  if (bytes.byteLength > IMAGE_LIMITS.storedBytes) {
    return {
      ok: false,
      reason: `The image is larger than ${IMAGE_LIMITS.storedBytes / (1024 * 1024)} MB.`,
    };
  }
  const info = readImageInfo(bytes);
  if (!info) return { ok: false, reason: 'Only PNG, JPEG and WebP images are supported.' };
  if (info.width < 1 || info.height < 1) return { ok: false, reason: 'The image has no size.' };
  if (info.width > IMAGE_LIMITS.maxEdgePx || info.height > IMAGE_LIMITS.maxEdgePx) {
    return {
      ok: false,
      reason: `The image is larger than ${IMAGE_LIMITS.maxEdgePx} px on one side.`,
    };
  }
  if (info.width * info.height > IMAGE_LIMITS.maxPixels) {
    return { ok: false, reason: 'The image has too many pixels.' };
  }
  return { ok: true, info };
}
