import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { IconX } from './icons.tsx';

interface DialogProps {
  title: string;
  /** Called when the dialog closes by any route (Esc, backdrop click, close button). */
  onClose(): void;
  children: ReactNode;
  /** Optional description shown under the title and linked for assistive technology. */
  description?: string;
  wide?: boolean;
}

/**
 * Brand dialog on the native <dialog> element: the browser provides the focus trap, Escape handling, inertness of
 * the page behind it and focus return. Always mounted open (render it conditionally).
 */
export function Dialog({ title, onClose, children, description, wide }: DialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // No close() on cleanup: it fires `close` -> onClose -> closeDialog() asynchronously, which (e.g. when React
    // StrictMode re-runs this effect) would dismiss the dialog right after it opened. Unmounting removes it anyway.
  }, []);

  return (
    // Backdrop click is a pointer convenience; keyboard users close with Escape (native) or the close button.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="hd-dialog"
      style={wide ? { inlineSize: 'min(48rem, calc(100vw - 2rem))' } : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // Click on the backdrop (the dialog element itself, outside its content box).
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          const inside =
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;
          if (!inside) onClose();
        }
      }}
    >
      <div className="dialog-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? (
            <p id={descId} className="hd-help" style={{ marginBlockStart: 'var(--hd-space-1)' }}>
              {description}
            </p>
          ) : null}
        </div>
        <button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}>
          <IconX />
        </button>
      </div>
      {children}
    </dialog>
  );
}
