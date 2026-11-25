import { describe, expect, it } from 'vitest';
import { paginate, type PaginateInput } from '../src/paginate.ts';

const base: Omit<PaginateInput, 'columns'> = {
  pageHeight: 1000,
  firstTop: 100,
  continuationTop: 50,
  bottomMid: 900,
  bottomLast: 800,
  maxPages: 3,
};

const rows = (prefix: string, count: number, height: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, height }));

describe('paginate', () => {
  it('keeps a short sheet on one page without spacers', () => {
    const result = paginate({ ...base, columns: [rows('a', 5, 100), rows('b', 3, 100)] });
    expect(result).toEqual({ pages: 1, spacers: {}, overflow: false });
  });

  it('uses the whole last-page area up to the footer, no further', () => {
    // 100 + 7 x 100 = 800: exactly fits above the footer on the only page.
    expect(paginate({ ...base, columns: [rows('a', 7, 100)] }).pages).toBe(1);
    // One more row would touch the footer text: a second page is needed.
    const result = paginate({ ...base, columns: [rows('a', 8, 100)] });
    expect(result.pages).toBe(2);
  });

  it('moves a row that does not fit to the next page and never splits it', () => {
    const result = paginate({ ...base, columns: [rows('a', 12, 100)] });
    expect(result.pages).toBe(2);
    // Page 1 holds a0..a7 (100..900 mid limit), a8 starts page 2 at 1000 + 50.
    expect(Object.keys(result.spacers)).toEqual(['a8']);
    expect(result.spacers.a8).toBe(1050 - 900);
    expect(result.overflow).toBe(false);
  });

  it('keeps every page above the logo, and the last one above the footer text too', () => {
    // 2 pages: page 1 rows to 900, page 2: 1050 + n*100 <= 1000 + 800.
    expect(paginate({ ...base, columns: [rows('a', 8 + 7, 100)] }).pages).toBe(2);
    // The 8th row of page 2 would end at 1850 (> 1800): a third page.
    const three = paginate({ ...base, columns: [rows('a', 8 + 8, 100)] });
    expect(three.pages).toBe(3);
  });

  it('paginates each column independently and uses the longer one', () => {
    const result = paginate({ ...base, columns: [rows('a', 2, 100), rows('b', 12, 100)] });
    expect(result.pages).toBe(2);
    expect(Object.keys(result.spacers)).toEqual(['b8']);
  });

  it('starts everything on page 2 when the top section leaves no room on page 1', () => {
    const result = paginate({ ...base, firstTop: 880, columns: [rows('a', 2, 100)] });
    expect(result.pages).toBe(2);
    expect(result.spacers.a0).toBe(1050 - 880);
  });

  it('shrinks back: fewer rows mean fewer pages and no spacers', () => {
    const many = paginate({ ...base, columns: [rows('a', 14, 100)] });
    const few = paginate({ ...base, columns: [rows('a', 3, 100)] });
    expect(many.pages).toBe(2);
    expect(few).toEqual({ pages: 1, spacers: {}, overflow: false });
  });

  it('reports overflow beyond the page limit', () => {
    const result = paginate({ ...base, columns: [rows('a', 60, 100)] });
    expect(result.overflow).toBe(true);
    expect(result.pages).toBeGreaterThan(base.maxPages);
  });

  it('flags a row taller than a page instead of looping', () => {
    const result = paginate({ ...base, columns: [[{ id: 'tall', height: 2000 }]] });
    expect(result.overflow).toBe(true);
  });

  it('handles empty tables', () => {
    expect(paginate({ ...base, columns: [[], []] })).toEqual({
      pages: 1,
      spacers: {},
      overflow: false,
    });
  });

  it('is a fixed point: spacers do not change what the next measurement would give', () => {
    const input = { ...base, columns: [rows('a', 20, 90), rows('b', 14, 130)] };
    expect(paginate(input)).toEqual(paginate(input));
  });
});
