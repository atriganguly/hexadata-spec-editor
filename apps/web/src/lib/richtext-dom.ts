import { normalize, type Mark, type RichText, type Run } from '@hexadata/spec-core';

/**
 * DOM -> rich text. Used for what the user typed in a contentEditable field AND for pasted HTML (parsed
 * into a detached document first). Only bold, italic and underline survive; everything else (fonts, colours,
 * links, classes, scripts) is dropped. Marks come from tags (<b>, <strong>, <i>, <em>, <u>) and from inline
 * styles, which is how Word, Google Docs and most web pages mark up pasted text.
 */
type Marks = Partial<Record<Mark, true>>;

const BLOCK_TAGS = new Set([
  'DIV',
  'P',
  'LI',
  'UL',
  'OL',
  'TR',
  'TABLE',
  'BLOCKQUOTE',
  'PRE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);
const SKIPPED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'HEAD',
  'META',
  'LINK',
  'TITLE',
  'NOSCRIPT',
]);

const isBoldWeight = (value: string) =>
  value === 'bold' || value === 'bolder' || (/^\d+$/.test(value) && Number(value) >= 600);
const isNormalWeight = (value: string) =>
  value === 'normal' || value === 'lighter' || (/^\d+$/.test(value) && Number(value) < 600);

function marksFor(el: Element, inherited: Marks): Marks {
  const next: Marks = { ...inherited };
  const style = (el as HTMLElement).style;
  const tag = el.tagName;
  const weight = style?.fontWeight ?? '';

  if (tag === 'B' || tag === 'STRONG') {
    // Google Docs wraps everything in <b style="font-weight:normal">: that is not bold.
    if (isNormalWeight(weight)) delete next.b;
    else next.b = true;
  } else if (isBoldWeight(weight)) next.b = true;
  else if (isNormalWeight(weight)) delete next.b;

  const fontStyle = style?.fontStyle ?? '';
  if (tag === 'I' || tag === 'EM' || fontStyle === 'italic' || fontStyle === 'oblique')
    next.i = true;
  else if (fontStyle === 'normal') delete next.i;

  const decoration = `${style?.textDecoration ?? ''} ${style?.getPropertyValue?.('text-decoration-line') ?? ''}`;
  if (tag === 'U' || decoration.includes('underline')) next.u = true;
  else if (/none/.test(decoration) && tag !== 'U') delete next.u;
  return next;
}

export function domToRichText(root: Node): RichText {
  const lines: Run[][] = [[]];
  let breakPending = false;

  const current = () => lines[lines.length - 1]!;
  const settleBreak = () => {
    if (breakPending && current().length > 0) lines.push([]);
    breakPending = false;
  };
  const pushText = (raw: string, marks: Marks) => {
    // Non-breaking space becomes a space; zero-width characters (space, non-joiner, joiner, BOM) are dropped.
    const text = raw
      .replace(/\u00a0/g, ' ')
      .replace(/\u200b/g, '')
      .replace(/\u200c/g, '')
      .replace(/\u200d/g, '')
      .replace(/\ufeff/g, '');
    if (text === '') return;
    settleBreak();
    text.split(/\r\n|\r|\n/).forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part !== '') current().push({ t: part, ...marks });
    });
  };

  const walk = (node: Node, marks: Marks) => {
    if (node.nodeType === 3) {
      pushText(node.nodeValue ?? '', marks);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (SKIPPED_TAGS.has(el.tagName)) return;
    if (el.tagName === 'BR') {
      settleBreak();
      lines.push([]);
      return;
    }
    const block = BLOCK_TAGS.has(el.tagName);
    if (block && current().length > 0) lines.push([]);
    const next = marksFor(el, marks);
    el.childNodes.forEach((child) => walk(child, next));
    if (block) breakPending = true;
  };

  root.childNodes.forEach((child) => walk(child, {}));
  return normalize(lines);
}

/** Parses clipboard HTML in an inert document (no scripts run, no resources load) and extracts rich text. */
export function htmlToRichText(html: string): RichText {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return domToRichText(doc.body);
}
