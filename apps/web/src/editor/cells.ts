import { LIMITS } from '@hexadata/spec-core';
import type { TextAddress, TextField } from '@hexadata/spec-templates';

const FIELD_LIMITS: Record<TextField, number> = {
  'meta.headerTitle': LIMITS.headerTitle,
  'meta.title': LIMITS.title,
  'meta.subtitle': LIMITS.subtitle,
  applications: LIMITS.applications,
  'footer.url': LIMITS.footerUrl,
  'footer.disclaimer': LIMITS.footerDisclaimer,
  'footer.copyright': LIMITS.footerCopyright,
};

const FIELD_LABELS: Record<TextField, string> = {
  'meta.headerTitle': 'Header title',
  'meta.title': 'Title',
  'meta.subtitle': 'Subtitle',
  applications: 'Applications',
  'footer.url': 'Footer link',
  'footer.disclaimer': 'Footer disclaimer',
  'footer.copyright': 'Footer copyright',
};

/** Maximum characters a cell may hold (the same limits the schema and the PDF server enforce). */
export function limitFor(address: TextAddress): number {
  if (address.kind === 'field') return FIELD_LIMITS[address.field];
  if (address.kind === 'feature') return LIMITS.featureText;
  return address.part === 'label' ? LIMITS.rowLabel : LIMITS.rowValue;
}

export function labelFor(address: TextAddress): string {
  if (address.kind === 'field') return FIELD_LABELS[address.field];
  if (address.kind === 'feature') return 'Key feature';
  return address.part === 'label' ? 'Specification label' : 'Specification value';
}

/** Stable DOM key used to find a cell again (focus management after add/remove). */
export function cellKey(address: TextAddress): string {
  if (address.kind === 'field') return `field:${address.field}`;
  if (address.kind === 'feature') return `feature:${address.id}`;
  return `row:${address.id}:${address.part}`;
}

export function focusCell(key: string, options: { end?: boolean } = {}): boolean {
  const el = document.querySelector<HTMLElement>(`[data-cell="${CSS.escape(key)}"]`);
  if (!el) return false;
  el.focus();
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(!options.end);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return true;
}

/** Focuses a cell once React has rendered it (after the store change that created it). */
export function focusCellSoon(key: string, options: { end?: boolean } = {}): void {
  let tries = 0;
  const attempt = () => {
    if (focusCell(key, options) || tries > 10) return;
    tries += 1;
    requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}
