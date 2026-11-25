/**
 * Automatic pagination of the specification tables. Pure arithmetic (no DOM, no React): the editor and the PDF
 * renderer measure the same things and call the same function, so both always break pages at the same rows.
 *
 * Model: the sheet is ONE continuous flow, `pages x pageHeight` tall. Rows never split. A row that does not fit
 * moves to the next page by getting a spacer (an empty table row) in front of it; page chrome (continuation header,
 * logo, footer) is drawn on top, per page, by the template. Only row HEIGHTS are inputs, and spacers do not change
 * them, so the result is a fixed point: measuring again after applying it gives the same answer.
 *
 * Coordinates are CSS pixels at 96 dpi from the top of page 1.
 */
export interface PaginateRow {
  id: string;
  height: number;
}

export interface PaginateInput {
  /** Rows of each table column, in order. */
  columns: ReadonlyArray<readonly PaginateRow[]>;
  pageHeight: number;
  /** Where the first row of page 1 starts. */
  firstTop: number;
  /** Where rows start on continuation pages (below the template's continuation header), from the page top. */
  continuationTop: number;
  /** Flow content must end above this on every page except the last (the logo), from the page top. */
  bottomMid: number;
  /** ...and above this on the last page (logo and footer text), from the page top. */
  bottomLast: number;
  maxPages: number;
}

export interface PaginateResult {
  /** Pages the sheet needs (at least 1). Above `maxPages` when `overflow` is true. */
  pages: number;
  /** Extra space, in px, to insert before a row so it starts on the next page. */
  spacers: Record<string, number>;
  /** More pages needed than allowed, or a row taller than a page. */
  overflow: boolean;
}

const EPSILON = 0.5;

interface Run {
  spacers: Record<string, number>;
  pages: number;
  /** A row taller than a page was left in place. */
  forced: boolean;
  /** Where the lowest row of the last page ends, from the top of that page. */
  lastPageEnd: number;
}

/** Lays rows out; pages from `lastFrom` on must clear the footer text as well as the logo. */
function run(input: PaginateInput, lastFrom: number): Run {
  const { pageHeight, firstTop, continuationTop } = input;
  const bottom = (page: number) => (page >= lastFrom ? input.bottomLast : input.bottomMid);
  const startOf = (page: number) => (page === 0 ? firstTop : page * pageHeight + continuationTop);
  const spacers: Record<string, number> = {};
  const ends: Array<{ page: number; y: number }> = [];
  let forced = false;

  for (const rows of input.columns) {
    let page = 0;
    let y = firstTop;
    for (const row of rows) {
      if (y + row.height > page * pageHeight + bottom(page) + EPSILON) {
        const atTop = page > 0 && Math.abs(y - startOf(page)) < EPSILON;
        const fitsNext = row.height <= input.bottomMid - continuationTop + EPSILON;
        if (!atTop && fitsNext) {
          page += 1;
          const next = startOf(page);
          spacers[row.id] = Math.max(0, next - y);
          y = next;
        } else {
          forced = true; // taller than a page: left in place (clipped) and reported
        }
      }
      y += row.height;
    }
    ends.push({ page, y });
  }

  const pages = Math.max(1, ...ends.map((end) => end.page + 1));
  const lastPageEnd = Math.max(
    firstTop,
    ...ends.filter((end) => end.page === pages - 1).map((end) => end.y - (pages - 1) * pageHeight),
  );
  return { spacers, pages, forced, lastPageEnd };
}

export function paginate(input: PaginateInput): PaginateResult {
  // First pass: every page only has to clear the logo. Then the last page also has to clear the footer text; if
  // its rows do not, the rows that reach into the footer zone move to a new last page.
  let result = run(input, Number.MAX_SAFE_INTEGER);
  if (result.lastPageEnd > input.bottomLast + EPSILON) {
    result = run(input, result.pages - 1);
  }
  return {
    pages: result.pages,
    spacers: result.spacers,
    overflow: result.pages > input.maxPages || result.forced,
  };
}

/** The result for a sheet that has not been measured yet: one page, nothing moved. */
export const SINGLE_PAGE: Readonly<PaginateResult> = Object.freeze({
  pages: 1,
  spacers: Object.freeze({}) as Record<string, number>,
  overflow: false,
});
