import { readFile, writeFile } from 'node:fs/promises';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { expect, test } from '@playwright/test';
import { openApp } from './helpers.ts';

/**
 * The editor and the PDF render the SAME template component, so what you see is what you print. This proves it
 * at pixel level: the sheet as drawn in the editor at 100% is compared with the exported PDF rasterised at the
 * same size. Anti-aliasing differs between a screen and a PDF rasteriser, so a small tolerance is allowed;
 * layout drift (a moved row, a missing logo, a wrong colour) is far larger and fails.
 */
async function pdfToPng(bytes: Uint8Array, scale: number): Promise<PNG> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale });
    const factory = (
      doc as unknown as {
        canvasFactory: { create(w: number, h: number): { canvas: unknown; context: unknown } };
      }
    ).canvasFactory;
    const target = factory.create(viewport.width, viewport.height);
    await page.render({
      canvasContext: target.context as never,
      viewport,
      canvas: target.canvas as never,
    }).promise;
    return PNG.sync.read(
      (target.canvas as { toBuffer(type: string): Buffer }).toBuffer('image/png'),
    );
  } finally {
    await task.destroy();
  }
}

test('the editor canvas matches the exported PDF (one template, two outputs)', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'hd-ui',
      JSON.stringify({ zoom: 1, draftsOpen: false, inspectorOpen: false }),
    );
  });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  // Tall enough that the whole A4 sheet (1123 px at 100%) is on screen: an element screenshot only captures what is visible.
  await page.setViewportSize({ width: 1440, height: 1400 });
  await openApp(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.cs-sheet')).toBeVisible();
  // Let overlays settle and park the pointer away from the sheet (no hover tints in the screenshot).
  await page.mouse.move(0, 0);
  // Floating chrome (zoom pill) must not sit on top of the sheet in the screenshot.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('.zoom-pill, .overlay'))
      el.style.display = 'none';
  });
  await page
    .locator('[data-edit-image="product"]')
    .evaluate((img) => (img as HTMLImageElement).decode());

  const screenshot = PNG.sync.read(
    await page.locator('.cs-sheet').screenshot({ animations: 'disabled', scale: 'css' }),
  );

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export PDF/ }).click();
  const pdfBytes = await readFile(await (await downloadPromise).path());
  const raster = await pdfToPng(pdfBytes, 96 / 72);

  expect(Math.abs(raster.width - screenshot.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(raster.height - screenshot.height)).toBeLessThanOrEqual(2);

  // Compare the common area.
  const width = Math.min(raster.width, screenshot.width);
  const height = Math.min(raster.height, screenshot.height);
  const crop = (png: PNG) => {
    const out = new PNG({ width, height });
    PNG.bitblt(png, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const a = crop(screenshot);
  const b = crop(raster);
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.25,
    includeAA: false,
  });
  const ratio = mismatched / (width * height);

  // Written next to the test results so a failing run can be inspected (kept on failure).
  await writeFile(testInfo.outputPath('diff.png'), PNG.sync.write(diff));
  await writeFile(testInfo.outputPath('editor.png'), PNG.sync.write(a));
  await writeFile(testInfo.outputPath('pdf.png'), PNG.sync.write(b));
  await testInfo.attach('editor', { body: PNG.sync.write(a), contentType: 'image/png' });
  await testInfo.attach('pdf', { body: PNG.sync.write(b), contentType: 'image/png' });
  await testInfo.attach('diff', { body: PNG.sync.write(diff), contentType: 'image/png' });
  console.log(
    `parity: ${(ratio * 100).toFixed(2)}% of pixels differ (${mismatched} of ${width * height})`,
  );
  // Text anti-aliasing differs by OS (0.9% on Windows, 2.8% on the Linux CI runner); a layout shift would be far higher.
  // In the minimum-font-size project the editor lays the sheet out 4x larger and scales it down: the layout is
  // identical, only the text anti-aliasing differs more.
  expect(ratio).toBeLessThan(testInfo.project.name === 'chromium-min-font' ? 0.08 : 0.04);
});
