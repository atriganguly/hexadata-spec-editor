import { LIMITS, type SpecSheetContent } from '@hexadata/spec-core';
import {
  computePagination,
  measureLayout,
  mmToPx,
  paginationGeometry,
  type LoadedTemplate,
  type PaginateResult,
} from '@hexadata/spec-templates';

export interface OverflowIssue {
  id: string;
  message: string;
}

/** Page breaks and the problems found while measuring the sheet. */
export interface SheetLayout extends PaginateResult {
  issues: OverflowIssue[];
}

export const SINGLE_PAGE_LAYOUT: SheetLayout = {
  pages: 1,
  spacers: {},
  overflow: false,
  issues: [],
};

/**
 * Measures the rendered sheet and decides where the specification rows break across pages: the same measurement and
 * the same pagination the PDF renderer uses, so the editor shows the pages the export will contain. Works on screen
 * coordinates scaled back to page pixels, so it is independent of the editor zoom.
 */
export function measureSheet(
  root: HTMLElement,
  template: LoadedTemplate,
  content: SpecSheetContent,
): SheetLayout | undefined {
  const measured = measureLayout(root, mmToPx(template.page.widthMm));
  if (!measured) return undefined;
  const result = computePagination(
    measured,
    paginationGeometry(template, content, LIMITS.maxPages),
  );
  return { ...result, issues: issuesFor(result) };
}

/** The problems a layout result means for the user (too many pages, a row taller than a page). */
export function issuesFor(result: PaginateResult): OverflowIssue[] {
  if (result.pages > LIMITS.maxPages) {
    return [
      {
        id: 'too-many-pages',
        message: `The sheet needs ${result.pages} pages; the limit is ${LIMITS.maxPages}. Shorten the specification.`,
      },
    ];
  }
  if (result.overflow) {
    return [
      {
        id: 'row-too-tall',
        message: 'A specification row is taller than a page. Shorten its text.',
      },
    ];
  }
  return [];
}
