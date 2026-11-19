import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { finalizePdf, PDF_AUTHOR, PDF_PRODUCER, slugify } from '../src/metadata.ts';

async function blankPdf(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([595.28, 841.89]);
  return doc.save();
}

describe('finalizePdf', () => {
  it('writes real document properties', async () => {
    const { pdf, pages } = await finalizePdf(await blankPdf(1), {
      title: 'HD-RS2200',
      keywords: ['Classic'],
    });
    const doc = await PDFDocument.load(pdf, { updateMetadata: false });
    expect(pages).toBe(1);
    expect(doc.getTitle()).toBe('HD-RS2200');
    expect(doc.getAuthor()).toBe(PDF_AUTHOR);
    expect(doc.getProducer()).toBe(PDF_PRODUCER);
    expect(doc.getCreator()).toBe(PDF_PRODUCER);
    expect(doc.getSubject()).toContain('Datasheet');
    expect(doc.getKeywords()).toContain('Classic');
    expect(doc.getCreationDate()).toBeInstanceOf(Date);
  });

  it('enforces the single-page lock by dropping extra pages', async () => {
    const result = await finalizePdf(await blankPdf(3), { title: 'x' });
    expect(result.pages).toBe(3);
    expect(result.droppedPages).toBe(2);
    expect((await PDFDocument.load(result.pdf)).getPageCount()).toBe(1);
  });

  it('rejects garbage input', async () => {
    await expect(finalizePdf(new Uint8Array([1, 2, 3]), { title: 'x' })).rejects.toThrow();
  });
});

describe('slugify', () => {
  it('makes safe ASCII file names', () => {
    expect(slugify('HD-RS2200 Version : G294')).toBe('hd-rs2200-version-g294');
    expect(slugify('Crème Brûlée / ../../etc')).toBe('creme-brulee-etc');
    expect(slugify('  ***  ')).toBe('hexadata-datasheet');
    expect(slugify('')).toBe('hexadata-datasheet');
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(60);
    expect(slugify('日本語')).toBe('hexadata-datasheet');
  });
});
