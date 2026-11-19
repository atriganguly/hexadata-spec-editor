/**
 * Rich text as data, never as HTML.
 *
 * A field is an array of lines; a line is an array of runs; a run is a piece of text with optional
 * bold / italic / underline marks. Rendering goes through React (escaped by construction), so the
 * client and the PDF server cannot inject markup. Only these three marks can ever exist.
 */
export interface Run {
  t: string;
  b?: true;
  i?: true;
  u?: true;
}
export type Line = Run[];
export type RichText = Line[];

export type Mark = 'b' | 'i' | 'u';

/** Build rich text from a plain string. `\n` starts a new line. No marks. */
export function rt(text: string): RichText {
  if (text === '') return [];
  return text.split('\n').map((line) => (line === '' ? [] : [{ t: line }]));
}

/** Plain text of a field (lines joined with `\n`). Used for PDF metadata and file names. */
export function plainText(value: RichText): string {
  return value.map((line) => line.map((run) => run.t).join('')).join('\n');
}

/** Total character count across all runs (newlines not counted). */
export function charCount(value: RichText): number {
  let n = 0;
  for (const line of value) for (const run of line) n += run.t.length;
  return n;
}

export function isEmpty(value: RichText): boolean {
  return charCount(value) === 0;
}

function sameMarks(a: Run, b: Run): boolean {
  return !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u;
}

/**
 * Canonical form: drops empty runs, merges neighbours with equal marks, removes trailing empty lines.
 * Idempotent. Always run this before storing or comparing.
 */
export function normalize(value: RichText): RichText {
  const lines: RichText = value.map((line) => {
    const out: Run[] = [];
    for (const run of line) {
      if (run.t === '') continue;
      const prev = out[out.length - 1];
      if (prev && sameMarks(prev, run)) {
        prev.t += run.t;
      } else {
        const next: Run = { t: run.t };
        if (run.b) next.b = true;
        if (run.i) next.i = true;
        if (run.u) next.u = true;
        out.push(next);
      }
    }
    return out;
  });
  while (lines.length > 0 && lines[lines.length - 1]!.length === 0) lines.pop();
  return lines;
}

export function richTextEquals(a: RichText, b: RichText): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) &&
        code > 0 &&
        code <= 0x10ffff &&
        !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : '';
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS = new Set([
  'div',
  'p',
  'li',
  'ul',
  'ol',
  'tr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);
const SKIP_CONTENT_TAGS = new Set(['script', 'style']);

/**
 * Converts the HTML strings of the pre-2.0 editor into rich text. Pure string processing (no DOM,
 * runs in Node and browsers). Everything except <b>/<strong>, <i>/<em>, <u>, <br> and block
 * boundaries is dropped; text is entity-decoded; <script>/<style> content is discarded.
 */
export function legacyHtmlToRichText(html: string): RichText {
  const lines: RichText = [];
  let current: Run[] = [];
  const depth = { b: 0, i: 0, u: 0 };
  let skipUntil: string | null = null;

  const endLine = () => {
    lines.push(current);
    current = [];
  };
  const pushText = (raw: string) => {
    const decoded = decodeEntities(raw);
    const parts = decoded.split(/\r?\n/);
    parts.forEach((part, index) => {
      if (index > 0) endLine();
      if (part === '') return;
      const run: Run = { t: part };
      if (depth.b > 0) run.b = true;
      if (depth.i > 0) run.i = true;
      if (depth.u > 0) run.u = true;
      current.push(run);
    });
  };

  const tokenRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|<!--[\s\S]*?-->|[^<]+|</g;
  for (const match of html.matchAll(tokenRe)) {
    const token = match[0];
    const tag = match[1]?.toLowerCase();
    if (!tag) {
      if (skipUntil || token.startsWith('<!--') || token === '<') {
        if (token === '<' && !skipUntil) pushText('<');
        continue;
      }
      pushText(token);
      continue;
    }
    const closing = token.startsWith('</');
    if (skipUntil) {
      if (closing && tag === skipUntil) skipUntil = null;
      continue;
    }
    if (!closing && SKIP_CONTENT_TAGS.has(tag)) {
      skipUntil = tag;
      continue;
    }
    if (tag === 'br') {
      endLine();
      continue;
    }
    const mark =
      tag === 'b' || tag === 'strong'
        ? 'b'
        : tag === 'i' || tag === 'em'
          ? 'i'
          : tag === 'u'
            ? 'u'
            : null;
    if (mark) {
      depth[mark] = Math.max(0, depth[mark] + (closing ? -1 : 1));
      continue;
    }
    if (BLOCK_TAGS.has(tag) && current.length > 0) endLine();
  }
  if (current.length > 0) endLine();
  return normalize(lines);
}
