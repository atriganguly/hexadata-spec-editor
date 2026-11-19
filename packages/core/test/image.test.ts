import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { checkImage, IMAGE_LIMITS, readImageInfo } from '../src/index.ts';

const raw = { width: 30, height: 20, channels: 3 as const, background: { r: 10, g: 120, b: 180 } };
const make = (format: 'png' | 'jpeg' | 'webp', options: object = {}) =>
  sharp({ create: raw })
    .toFormat(format, options)
    .toBuffer()
    .then((b) => new Uint8Array(b));

describe('readImageInfo', () => {
  it('reads PNG, JPEG and WebP sizes from the header', async () => {
    expect(readImageInfo(await make('png'))).toEqual({ mime: 'image/png', width: 30, height: 20 });
    expect(readImageInfo(await make('jpeg'))).toEqual({
      mime: 'image/jpeg',
      width: 30,
      height: 20,
    });
    expect(readImageInfo(await make('webp'))).toEqual({
      mime: 'image/webp',
      width: 30,
      height: 20,
    });
    expect(readImageInfo(await make('webp', { lossless: true }))).toEqual({
      mime: 'image/webp',
      width: 30,
      height: 20,
    });
  });

  it('reads WebP files with alpha (extended format) and progressive JPEG', async () => {
    const alpha = await sharp({
      create: { ...raw, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } },
    })
      .webp()
      .toBuffer();
    expect(readImageInfo(new Uint8Array(alpha))).toMatchObject({
      mime: 'image/webp',
      width: 30,
      height: 20,
    });
    expect(readImageInfo(await make('jpeg', { progressive: true }))).toMatchObject({
      width: 30,
      height: 20,
    });
  });

  it('rejects other formats and disguised files', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
    const gif = new TextEncoder().encode('GIF89a\u0001\u0000\u0001\u0000');
    const pdf = new TextEncoder().encode('%PDF-1.7');
    for (const bytes of [svg, html, gif, pdf, new Uint8Array(), new Uint8Array(40)]) {
      expect(readImageInfo(bytes)).toBeNull();
    }
  });

  it('does not throw on truncated or malformed headers', async () => {
    const png = await make('png');
    const jpeg = await make('jpeg');
    const webp = await make('webp');
    for (const full of [png, jpeg, webp]) {
      for (const cut of [1, 3, 8, 11, 16, 20, 25]) {
        expect(() => readImageInfo(full.subarray(0, cut))).not.toThrow();
      }
    }
    // Segment length that loops forever must terminate.
    const evil = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xe0, 0x00, 0x00]);
    expect(readImageInfo(evil)).toBeNull();
  });
});

describe('checkImage', () => {
  it('accepts a normal image', async () => {
    const result = checkImage(await make('png'));
    expect(result.ok).toBe(true);
  });

  it('rejects empty, unsupported and oversized-dimension images', async () => {
    expect(checkImage(new Uint8Array()).ok).toBe(false);
    expect(checkImage(new TextEncoder().encode('hello')).ok).toBe(false);

    // Forge a PNG header that claims a huge canvas (decompression bomb).
    const png = new Uint8Array(await make('png'));
    const view = new DataView(png.buffer, png.byteOffset);
    view.setUint32(16, IMAGE_LIMITS.maxEdgePx + 1);
    const tooWide = checkImage(png);
    expect(tooWide.ok).toBe(false);

    view.setUint32(16, IMAGE_LIMITS.maxEdgePx);
    view.setUint32(20, IMAGE_LIMITS.maxEdgePx);
    const tooManyPixels = checkImage(png);
    expect(tooManyPixels.ok).toBe(false);
    if (!tooManyPixels.ok) expect(tooManyPixels.reason).toContain('pixels');
  });

  it('rejects files over the stored size limit', () => {
    const big = new Uint8Array(IMAGE_LIMITS.storedBytes + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkImage(big).ok).toBe(false);
  });
});
