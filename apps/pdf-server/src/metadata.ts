import { PDFDocument } from 'pdf-lib';

export interface PdfMetadata {
  title: string;
  /** Plain-text key terms (template name, product). */
  keywords?: string[];
}

export const PDF_AUTHOR = 'HexaData (Esconet Technologies Limited)';
export const PDF_PRODUCER = 'HexaData Spec Editor';

/**
 * Chrome's own PDF has no usable metadata (Producer "Skia/PDF", empty Title). This writes real document
 * properties and enforces the page count the layout asked for (`expectedPages`): stray extra pages, such as a
 * blank trailing page from rounding, are dropped; fewer pages than expected is an error.
 *
 * Object streams are disabled so the file stays simple to inspect and diff (font names, metadata).
 */
export async function finalizePdf(
  bytes: Uint8Array,
  meta: PdfMetadata,
  expectedPages = 1,
): Promise<{ pdf: Uint8Array; pages: number; droppedPages: number }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const found = doc.getPageCount();
  let dropped = 0;
  if (found < expectedPages) throw new Error(`Expected ${expectedPages} pages, got ${found}.`);
  while (doc.getPageCount() > expectedPages) {
    doc.removePage(doc.getPageCount() - 1);
    dropped += 1;
  }

  const now = new Date();
  doc.setTitle(meta.title);
  doc.setAuthor(PDF_AUTHOR);
  doc.setSubject('Technical Product Specification Datasheet');
  doc.setCreator(PDF_PRODUCER);
  doc.setProducer(PDF_PRODUCER);
  doc.setKeywords(['HexaData', 'datasheet', ...(meta.keywords ?? [])]);
  doc.setLanguage('en');
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  // Show the title (not the file name) in viewers' title bars.
  doc.catalog.getOrCreateViewerPreferences().setDisplayDocTitle(true);

  const pdf = await doc.save({ useObjectStreams: false });
  return { pdf, pages: found, droppedPages: dropped };
}

/** `HD-RS2200 Version : G294` -> `hd-rs2200-version-g294` (ASCII, safe for headers and file systems). */
export function slugify(text: string, fallback = 'hexadata-datasheet'): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || fallback;
}
