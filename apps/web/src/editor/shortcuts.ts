import { useEffect } from 'react';
import { useDoc } from '../store/doc.ts';
import { clampZoom, useUi, ZOOM_STEP } from '../store/ui.ts';

export interface ShortcutHandlers {
  save(): void;
  exportPdf(): void;
  newDraft(): void;
}

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = () => (isMac() ? '⌘' : 'Ctrl');

export const SHORTCUTS: Array<{
  keys: string;
  action: string;
  group: 'Document' | 'Text' | 'Lists' | 'View';
}> = [
  { keys: 'Ctrl+S', action: 'Save now (drafts also save automatically)', group: 'Document' },
  { keys: 'Ctrl+Shift+E', action: 'Export PDF', group: 'Document' },
  { keys: 'Ctrl+Alt+N', action: 'New draft', group: 'Document' },
  { keys: 'Ctrl+Z', action: 'Undo', group: 'Document' },
  { keys: 'Ctrl+Shift+Z / Ctrl+Y', action: 'Redo', group: 'Document' },
  { keys: 'Ctrl+B / I / U', action: 'Bold, italic, underline', group: 'Text' },
  { keys: 'Shift+Enter', action: 'New line inside a cell', group: 'Text' },
  { keys: 'Enter', action: 'Add a key feature below (in a feature)', group: 'Lists' },
  { keys: 'Backspace', action: 'Remove an empty key feature', group: 'Lists' },
  { keys: 'Ctrl+Enter', action: 'Add a table row below (in a row)', group: 'Lists' },
  { keys: 'Ctrl+Shift+Backspace', action: 'Remove the current table row', group: 'Lists' },
  { keys: 'Alt+↑ / Alt+↓', action: 'Move the current feature or row', group: 'Lists' },
  { keys: 'Ctrl++ / Ctrl+− / Ctrl+0', action: 'Zoom in, out, fit width', group: 'View' },
  { keys: 'Ctrl+scroll', action: 'Zoom the sheet', group: 'View' },
  { keys: '?', action: 'Show this list (outside text fields)', group: 'View' },
];

const typingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * App-wide keyboard shortcuts. Undo/redo are handled here (not by the browser) so a single history covers
 * text, structure and images, whatever has focus.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const doc = useDoc.getState();
      const ui = useUi.getState();

      if (mod && key === 'z' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        doc.undo();
        ui.announce(useDoc.getState().lastAction || 'Nothing to undo');
        return;
      }
      if (mod && ((key === 'z' && event.shiftKey) || key === 'y')) {
        event.preventDefault();
        doc.redo();
        ui.announce(useDoc.getState().lastAction || 'Nothing to redo');
        return;
      }
      if (mod && key === 's') {
        event.preventDefault();
        handlers.save();
        return;
      }
      if (mod && event.shiftKey && key === 'e') {
        event.preventDefault();
        handlers.exportPdf();
        return;
      }
      if (mod && event.altKey && key === 'n') {
        event.preventDefault();
        handlers.newDraft();
        return;
      }
      if (mod && (event.key === '+' || event.key === '=')) {
        event.preventDefault();
        ui.setZoom(clampZoom(ui.zoomFactor + ZOOM_STEP));
        return;
      }
      if (mod && (event.key === '-' || event.key === '_')) {
        event.preventDefault();
        ui.setZoom(clampZoom(ui.zoomFactor - ZOOM_STEP));
        return;
      }
      if (mod && event.key === '0') {
        event.preventDefault();
        ui.setZoom('fit-width');
        return;
      }
      if (event.key === '?' && !mod && !typingTarget(event.target)) {
        event.preventDefault();
        ui.openDialog({ kind: 'shortcuts' });
      }
    };
    // Capture phase: runs before the contentEditable's native undo/redo.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [handlers]);
}
