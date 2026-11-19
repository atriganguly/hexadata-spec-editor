import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';

export interface MenuEntry {
  label: string;
  icon?: ReactElement;
  onSelect(): void;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Draws a separator before this entry. */
  separator?: boolean;
}

interface MenuProps {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: ReactNode;
  entries: MenuEntry[];
  up?: boolean;
  triggerClassName?: string;
}

/**
 * Accessible action menu (WAI-ARIA menu button): Enter/Space/ArrowDown opens, arrows move, Home/End jump, Escape
 * closes and returns focus, typing a letter jumps to a matching item, Tab closes.
 */
export function Menu({
  label,
  trigger,
  entries,
  up,
  triggerClassName = 'icon-btn',
}: MenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const items = () =>
    Array.from(
      host.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        list[(index + 1) % list.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        list[(index - 1 + list.length) % list.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        list[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        list[list.length - 1]?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const next =
            list.find(
              (el, i) =>
                i > index &&
                el.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()),
            ) ??
            list.find((el) =>
              el.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()),
            );
          next?.focus();
        }
    }
  };

  return (
    <div className="menu-host" ref={host}>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          className={up ? 'menu menu--up' : 'menu'}
          onKeyDown={onKeyDown}
        >
          {entries.map((entry) => (
            <div key={entry.label} role="none">
              {entry.separator ? <div className="menu__sep" role="separator" /> : null}
              <button
                type="button"
                role="menuitem"
                className="menu__item"
                disabled={entry.disabled}
                onClick={() => {
                  close(false);
                  entry.onSelect();
                }}
              >
                {entry.icon}
                <span>{entry.label}</span>
                {entry.shortcut ? <span className="menu__kbd">{entry.shortcut}</span> : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
