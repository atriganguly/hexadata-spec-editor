import { useEffect, useState, type ReactElement } from 'react';
import { IconBold, IconClearFormat, IconItalic, IconUnderline } from '../ui/icons.tsx';

type Command = 'bold' | 'italic' | 'underline' | 'removeFormat';

/** Runs a formatting command on the current selection without moving focus out of the cell. */
export function runFormat(command: Command): void {
  // Tags, not inline styles (the CSP blocks `style` attributes).
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand(command);
}

function selectionInCell(): { rect: DOMRect; cell: HTMLElement } | undefined {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const cell = element?.closest<HTMLElement>('[contenteditable="true"]');
  if (!cell) return undefined;
  const rect = range.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? undefined : { rect, cell };
}

const state = (command: 'bold' | 'italic' | 'underline') => {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
};

interface ButtonProps {
  command: Command;
  label: string;
  shortcut?: string;
  pressed?: boolean;
  children: ReactElement;
}

function FormatButton({ command, label, shortcut, pressed, children }: ButtonProps): ReactElement {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={pressed}
      // Keep the text selection: mouse down on a button would otherwise blur the cell.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => runFormat(command)}
    >
      {children}
    </button>
  );
}

/** Bold / italic / underline / clear, as a floating bar over the selection. */
export function FormatToolbar(): ReactElement | null {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | undefined>();
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });

  useEffect(() => {
    const update = () => {
      const found = selectionInCell();
      if (!found) {
        setAnchor(undefined);
        return;
      }
      setAnchor({
        x: Math.min(window.innerWidth - 90, Math.max(90, found.rect.left + found.rect.width / 2)),
        y: Math.max(52, found.rect.top - 8),
      });
      setActive({ bold: state('bold'), italic: state('italic'), underline: state('underline') });
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  if (!anchor) return null;
  return (
    <div
      className="format-bar"
      style={{ left: anchor.x, top: anchor.y }}
      role="toolbar"
      aria-label="Text formatting"
    >
      <FormatButton command="bold" label="Bold" shortcut="Ctrl+B" pressed={active.bold}>
        <IconBold />
      </FormatButton>
      <FormatButton command="italic" label="Italic" shortcut="Ctrl+I" pressed={active.italic}>
        <IconItalic />
      </FormatButton>
      <FormatButton
        command="underline"
        label="Underline"
        shortcut="Ctrl+U"
        pressed={active.underline}
      >
        <IconUnderline />
      </FormatButton>
      <FormatButton command="removeFormat" label="Clear formatting">
        <IconClearFormat />
      </FormatButton>
    </div>
  );
}
