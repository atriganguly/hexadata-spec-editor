import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { defaultDocument, multipart, pdfToPng, testConfig } from './helpers.ts';

/**
 * Structural visual checks on the rasterised PDF. They prove the template CSS, brand colours and fonts are
 * really applied (a PDF without styles still "renders", so text-only assertions cannot catch that).
 * Colour sampling instead of pixel goldens keeps the test stable across operating systems.
 */
let app: FastifyInstance;
let png: Buffer;
let raw: { data: Buffer; width: number; height: number };

const near = (actual: number[], expected: [number, number, number], tolerance = 8) =>
  expected.every((value, index) => Math.abs((actual[index] ?? 0) - value) <= tolerance);

const pixel = (x: number, y: number) => {
  const offset = (y * raw.width + x) * 3;
  return [raw.data[offset]!, raw.data[offset + 1]!, raw.data[offset + 2]!];
};

function countNear(
  color: [number, number, number],
  region: { x0: number; y0: number; x1: number; y1: number },
  tolerance = 30,
) {
  let count = 0;
  for (let y = region.y0; y < region.y1; y += 1) {
    for (let x = region.x0; x < region.x1; x += 1)
      if (near(pixel(x, y), color, tolerance)) count += 1;
  }
  return count;
}

const CYAN: [number, number, number] = [0, 155, 182];
const DEEP_BLUE: [number, number, number] = [4, 106, 167];
const OBSIDIAN: [number, number, number] = [18, 30, 54];

beforeAll(async () => {
  ({ app } = await buildApp(testConfig()));
  const form = multipart({ document: JSON.stringify(await defaultDocument()) });
  const res = await app.inject({
    method: 'POST',
    url: '/v1/render',
    payload: form.payload,
    headers: form.headers,
  });
  expect(res.statusCode).toBe(200);
  png = await pdfToPng(new Uint8Array(res.rawPayload), 1);
  const decoded = await sharp(png)
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  raw = { data: decoded.data, width: decoded.info.width, height: decoded.info.height };
});
afterAll(() => app.close());

describe('Classic print output', () => {
  it('is an A4 page raster', () => {
    expect(raw.width).toBeCloseTo(595, -1);
    expect(raw.height).toBeCloseTo(842, -1);
  });

  it('has the cyan header bar at the top edge and the cyan bottom bar at the bottom edge', () => {
    expect(near(pixel(4, 4), CYAN)).toBe(true);
    expect(near(pixel(raw.width - 4, 30), CYAN)).toBe(true);
    expect(near(pixel(300, raw.height - 3), CYAN)).toBe(true);
    expect(near(pixel(4, raw.height - 3), CYAN)).toBe(true);
  });

  it('draws the header title in Obsidian on cyan (not white)', () => {
    const obsidian = countNear(OBSIDIAN, { x0: 30, y0: 8, x1: 330, y1: 32 });
    const white = countNear([248, 250, 252], { x0: 30, y0: 8, x1: 330, y1: 32 }, 6);
    expect(obsidian).toBeGreaterThan(300);
    expect(white).toBeLessThan(20);
  });

  it('draws the title in Deep Blue', () => {
    expect(countNear(DEEP_BLUE, { x0: 30, y0: 55, x1: 360, y1: 100 })).toBeGreaterThan(300);
  });

  it('draws section tabs and rules in cyan', () => {
    expect(countNear(CYAN, { x0: 270, y0: 110, x1: 595, y1: 135 })).toBeGreaterThan(300);
  });

  it('places the HexaData mark bottom-right and the product photo left of the features', () => {
    const logoRegion = { x0: 440, y0: 750, x1: 595, y1: 835 };
    expect(
      countNear([4, 106, 167], logoRegion, 50) + countNear(CYAN, logoRegion, 50),
    ).toBeGreaterThan(600);
    // product image region (80 x 60 mm slot) contains mid-tone photo pixels, not white
    let nonWhite = 0;
    for (let y = 150; y < 260; y += 2)
      for (let x = 40; x < 250; x += 2) if (pixel(x, y).some((c) => c < 235)) nonWhite += 1;
    expect(nonWhite).toBeGreaterThan(800);
  });

  it('keeps the specification table inside the page margins', () => {
    // Nothing but paper in the 12 mm side margins below the header (x < 30px) between header and bottom bar.
    let ink = 0;
    for (let y = 60; y < 800; y += 3)
      for (let x = 0; x < 30; x += 1) if (pixel(x, y).some((c) => c < 200)) ink += 1;
    expect(ink).toBe(0);
  });
});
