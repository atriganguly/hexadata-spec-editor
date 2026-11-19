export interface OverflowIssue {
  id: string;
  message: string;
}

const MARK = 'overflow';

function intersects(a: DOMRect, b: DOMRect, tolerance = 1): boolean {
  return (
    a.left < b.right - tolerance &&
    a.right > b.left + tolerance &&
    a.top < b.bottom - tolerance &&
    a.bottom > b.top + tolerance
  );
}

/**
 * Finds content that collides with fixed page elements (footer, logo) or runs past the page. Templates opt in
 * by tagging elements with `data-hd-flow` (flowing content) and `data-hd-fixed` (absolutely positioned content).
 * Works on screen coordinates, so it is independent of the editor zoom. Offending flow elements get
 * `data-overflow="true"` (the editor outlines them).
 */
export function measureOverflow(root: HTMLElement): OverflowIssue[] {
  const sheet = root.querySelector<HTMLElement>('[data-template]');
  const flows = Array.from(root.querySelectorAll<HTMLElement>('[data-hd-flow]'));
  const fixed = Array.from(root.querySelectorAll<HTMLElement>('[data-hd-fixed]'));
  for (const el of flows) delete el.dataset[MARK];
  if (!sheet) return [];

  const page = sheet.getBoundingClientRect();
  const issues: OverflowIssue[] = [];
  flows.forEach((flow, index) => {
    const rect = flow.getBoundingClientRect();
    if (rect.height === 0) return;
    const label = flows.length > 1 ? `Specification table ${index + 1}` : 'Content';
    if (rect.bottom > page.bottom + 1) {
      flow.dataset[MARK] = 'true';
      issues.push({ id: `page-${index}`, message: `${label} runs past the bottom of the page.` });
      return;
    }
    if (fixed.some((other) => intersects(rect, other.getBoundingClientRect()))) {
      flow.dataset[MARK] = 'true';
      issues.push({
        id: `footer-${index}`,
        message: `${label} overlaps the footer or the HexaData logo.`,
      });
    }
  });
  return issues;
}
