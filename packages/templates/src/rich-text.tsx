import { Fragment, type ReactNode } from 'react';
import type { Line, RichText, Run } from '@hexadata/spec-core';

/**
 * Two renderers of the same structure:
 *  - `renderRichText` returns React elements (escaped by React) for static/PDF rendering.
 *  - `richTextToHtml` returns an HTML string (escaped here) that the editor assigns to a
 *    contentEditable element. A test proves both produce identical markup.
 *
 * Mark nesting is always <b><i><u>text</u></i></b>. An empty field renders a lone <br>, so empty
 * cells keep one line of height in the editor and in the PDF alike.
 */

function renderRun(run: Run, key: number): ReactNode {
  let node: ReactNode = run.t;
  if (run.u) node = <u>{node}</u>;
  if (run.i) node = <i>{node}</i>;
  if (run.b) node = <b>{node}</b>;
  return <Fragment key={key}>{node}</Fragment>;
}

function renderLine(line: Line): ReactNode[] {
  return line.map(renderRun);
}

export function renderRichText(value: RichText): ReactNode {
  if (value.length === 0) return <br />;
  const out: ReactNode[] = [];
  value.forEach((line, index) => {
    if (index > 0) out.push(<br key={`br-${index}`} />);
    out.push(<Fragment key={`l-${index}`}>{renderLine(line)}</Fragment>);
  });
  return out;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ESCAPES[ch] ?? ch);
}

export function richTextToHtml(value: RichText): string {
  if (value.length === 0) return '<br>';
  return value
    .map((line) =>
      line
        .map((run) => {
          let html = escapeHtml(run.t);
          if (run.u) html = `<u>${html}</u>`;
          if (run.i) html = `<i>${html}</i>`;
          if (run.b) html = `<b>${html}</b>`;
          return html;
        })
        .join(''),
    )
    .join('<br>');
}
