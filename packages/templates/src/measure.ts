import type { SpecSheetContent } from '@hexadata/spec-core';
import { pageNumbersShown } from './fields.ts';
import { paginate, type PaginateResult, type PaginateRow } from './paginate.ts';
import type { TemplateMeta } from './types.ts';

/** What the layout needs to know about a rendered sheet. Sizes are CSS px at 96 dpi, independent of any zoom. */
export interface LayoutMeasurement {
  /** Rows of each specification column, in order. */
  columns: PaginateRow[][];
  /** Top of the first flowing table, from the top of the sheet. */
  firstTop: number;
  /** Distance from the bottom of its page up to the top of the logo (page chrome), or null. */
  markFromBottom: number | null;
  /** Distance from the bottom of its page up to the top of the footer text, or null. */
  footerFromBottom: number | null;
}

/**
 * Reads the geometry of a rendered sheet. Used by the editor (on its live DOM, scaled and zoomed) and by the PDF
 * renderer (serialised into the headless browser with `page.evaluate`), which is why it must stay SELF-CONTAINED:
 * no imports or helpers from this module may be used inside it.
 */
export function measureLayout(
  root: ParentNode | null,
  pageWidthPx: number,
): LayoutMeasurement | null {
  const scope: ParentNode = root ?? document;
  const sheet = scope.querySelector('[data-template]');
  if (!sheet) return null;
  const sheetRect = sheet.getBoundingClientRect();
  const scale = sheetRect.width / pageWidthPx || 1;

  const columns: PaginateRow[][] = [[], []];
  scope.querySelectorAll('tr[data-hd-row]').forEach((row) => {
    const column = row.getAttribute('data-hd-col') === '1' ? 1 : 0;
    columns[column]!.push({
      id: row.getAttribute('data-hd-row') ?? '',
      height: row.getBoundingClientRect().height / scale,
    });
  });

  const flow = scope.querySelector('[data-hd-flow]');
  const firstTop = flow ? (flow.getBoundingClientRect().top - sheetRect.top) / scale : 0;

  const fromBottom = (kind: string): number | null => {
    const all = scope.querySelectorAll(`[data-hd-fixed="${kind}"]`);
    const el = all[all.length - 1];
    const page = el?.closest('[data-hd-page]');
    if (!el || !page) return null;
    return (page.getBoundingClientRect().bottom - el.getBoundingClientRect().top) / scale;
  };

  return {
    columns,
    firstTop,
    markFromBottom: fromBottom('mark'),
    footerFromBottom: fromBottom('footer'),
  };
}

const MM_TO_PX = 96 / 25.4;
/** Air between the last row of a page and the logo / footer text. */
const CLEARANCE_MM = 1.5;

export interface PaginationGeometry {
  pageHeightMm: number;
  continuationTopMm: number;
  /** Room the slim footer (every page but the last) takes from the page bottom. */
  slimFooterMm: number;
  maxPages: number;
}

/** The pagination geometry of a template for this content (page numbers change the room the slim footer needs). */
export function paginationGeometry(
  template: Pick<TemplateMeta, 'page' | 'pagination'>,
  content: SpecSheetContent,
  maxPages: number,
): PaginationGeometry {
  const { pagination, page } = template;
  return {
    pageHeightMm: page.heightMm,
    continuationTopMm: pagination.continuationTopMm,
    slimFooterMm: pageNumbersShown(content)
      ? pagination.slimFooterMm
      : pagination.slimFooterNoNumbersMm,
    maxPages,
  };
}

/** Turns a measurement into page breaks. */
export function computePagination(
  measured: LayoutMeasurement,
  geometry: PaginationGeometry,
): PaginateResult {
  const pageHeight = geometry.pageHeightMm * MM_TO_PX;
  const clearance = CLEARANCE_MM * MM_TO_PX;
  const mark = measured.markFromBottom ?? 0; // the logo: measured on the last page
  const footer = measured.footerFromBottom ?? 0;
  return paginate({
    columns: measured.columns,
    pageHeight,
    firstTop: measured.firstTop,
    continuationTop: geometry.continuationTopMm * MM_TO_PX,
    bottomMid: pageHeight - geometry.slimFooterMm * MM_TO_PX - clearance,
    bottomLast: pageHeight - Math.max(mark, footer) - clearance,
    maxPages: geometry.maxPages,
  });
}

/** Page width in px for `measureLayout`. */
export const mmToPx = (mm: number): number => mm * MM_TO_PX;
