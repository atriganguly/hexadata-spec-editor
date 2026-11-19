import {
  memo,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { richTextEquals, richTextFits, rt, type RichText } from '@hexadata/spec-core';
import { richTextToHtml, type TextAddress, type TextCellProps } from '@hexadata/spec-templates';
import { domToRichText, htmlToRichText } from '../lib/richtext-dom.ts';
import { useDoc } from '../store/doc.ts';
import { useUi } from '../store/ui.ts';
import { cellKey, focusCellSoon, labelFor, limitFor } from './cells.ts';

/**
 * Chrome's formatting commands write inline `style` attributes by default, which the app's Content-Security-Policy
 * (`style-src 'self'`) blocks. Asking for tags instead gives plain <b>/<i>/<u>, which is also exactly our data model.
 */
export function preferTagsOverStyles(): void {
  document.execCommand('styleWithCSS', false, 'false');
}

/** True when `el` currently has the caret (or selection) inside it. */
const isFocused = (el: HTMLElement) => el === document.activeElement;

function placeCaretAtEnd(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertHtmlAtCaret(html: string): void {
  if (document.execCommand('insertHTML', false, html)) return;
  // Fallback for engines without execCommand support.
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function insertLineBreak(): void {
  if (document.execCommand('insertLineBreak')) return;
  insertHtmlAtCaret('<br>');
}

/** How many characters the clipboard text may add before the field limit. */
function remainingCapacity(el: HTMLElement, address: TextAddress): number {
  const used = domToRichText(el).reduce(
    (sum, line) => sum + line.reduce((n, run) => n + run.t.length, 0),
    0,
  );
  const selected = window.getSelection()?.toString().replace(/\n/g, '').length ?? 0;
  return Math.max(0, limitFor(address) - used + selected);
}

function truncate(value: RichText, maxChars: number): RichText {
  let left = maxChars;
  const out: RichText = [];
  for (const line of value) {
    if (left <= 0) break;
    const runs = [];
    for (const run of line) {
      if (left <= 0) break;
      const text = run.t.slice(0, left);
      left -= text.length;
      runs.push({ ...run, t: text });
    }
    out.push(runs);
  }
  return out;
}

/**
 * The editable text cell. It renders the SAME element and class names as the print cell (`div.rt`); the only
 * differences are contentEditable and a few data attributes, so the editor and the PDF cannot drift apart.
 *
 * The element is uncontrolled while the user types (React never rewrites it under the caret); the model is
 * updated from the DOM on every input, and the DOM is rewritten from the model only when they differ (undo,
 * redo, switching drafts, resets).
 */
export const EditableTextCell = memo(function EditableTextCell({
  address,
  value,
  className,
}: TextCellProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ address, value });
  useLayoutEffect(() => {
    latest.current = { address, value };
  });
  const setText = useDoc((state) => state.setText);
  const key = cellKey(address);

  // Model -> DOM.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isFocused(el)) {
      if (richTextEquals(domToRichText(el), value)) return; // the user's own typing
      el.innerHTML = richTextToHtml(value);
      placeCaretAtEnd(el);
      return;
    }
    const html = richTextToHtml(value);
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [value]);

  const flagLimit = (el: HTMLElement) => {
    el.dataset.limit = 'true';
    useUi.getState().announce(`Character limit reached (${limitFor(latest.current.address)}).`);
    setTimeout(() => delete el.dataset.limit, 1200);
  };

  const commit = (el: HTMLElement) => {
    const next = domToRichText(el);
    const { address: addr, value: current } = latest.current;
    if (!richTextFits(next, limitFor(addr))) {
      // Over the limit (typing or paste): keep the last valid text.
      el.innerHTML = richTextToHtml(current);
      placeCaretAtEnd(el);
      flagLimit(el);
      return;
    }
    if (richTextEquals(next, current)) return;
    setText(addr, next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { address: addr } = latest.current;
    const store = useDoc.getState();
    const mod = event.ctrlKey || event.metaKey;

    if (addr.kind === 'feature') {
      if (event.key === 'Enter' && !event.shiftKey && !mod) {
        event.preventDefault();
        const id = store.addFeature(addr.id);
        focusCellSoon(cellKey({ kind: 'feature', id }));
        return;
      }
      if (event.key === 'Backspace' && domToRichText(event.currentTarget).length === 0) {
        event.preventDefault();
        const list = store.content.keyFeatures;
        const index = list.findIndex((f) => f.id === addr.id);
        const previous = list[index - 1];
        store.removeFeature(addr.id);
        if (previous) focusCellSoon(cellKey({ kind: 'feature', id: previous.id }), { end: true });
        return;
      }
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        store.moveFeature(addr.id, event.key === 'ArrowUp' ? -1 : 1);
        focusCellSoon(key, { end: true });
        return;
      }
    }

    if (addr.kind === 'row') {
      if (mod && event.key === 'Enter') {
        event.preventDefault();
        const id = store.addRow(addr.column, addr.id);
        focusCellSoon(cellKey({ kind: 'row', column: addr.column, id, part: 'label' }));
        return;
      }
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        store.moveRow(addr.column, addr.id, event.key === 'ArrowUp' ? -1 : 1);
        focusCellSoon(key, { end: true });
        return;
      }
      if (mod && event.shiftKey && event.key === 'Backspace') {
        event.preventDefault();
        store.removeRow(addr.column, addr.id);
        return;
      }
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    const incoming = html ? htmlToRichText(html) : rt(text);
    const room = remainingCapacity(event.currentTarget, latest.current.address);
    const fitted = truncate(incoming, room);
    if (fitted.length < incoming.length || JSON.stringify(fitted) !== JSON.stringify(incoming)) {
      flagLimit(event.currentTarget);
    }
    // Our own markup: only text (escaped here) and <b>/<i>/<u>/<br>.
    insertHtmlAtCaret(richTextToHtml(fitted).replace(/^<br>$/, ''));
  };

  return (
    <div
      ref={ref}
      className={['rt', className].filter(Boolean).join(' ')}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      tabIndex={0}
      aria-multiline="true"
      aria-label={labelFor(address)}
      data-cell={key}
      onFocus={preferTagsOverStyles}
      onInput={(event) => commit(event.currentTarget)}
      onBeforeInput={(event) => {
        const type = (event.nativeEvent as InputEvent).inputType;
        if (type === 'insertParagraph') {
          event.preventDefault();
          insertLineBreak();
        } else if (type === 'insertFromDrop' || type === 'insertFromYank') {
          event.preventDefault();
        }
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onDrop={(event) => event.preventDefault()}
      onBlur={(event) => {
        // Canonicalise the DOM (merged runs, no stray markup) once the user leaves the cell.
        const el = event.currentTarget;
        const html = richTextToHtml(latest.current.value);
        if (el.innerHTML !== html) el.innerHTML = html;
      }}
    />
  );
});
