import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react';
import { LIMITS } from '@hexadata/spec-core';
import { useDoc } from '../store/doc.ts';
import { useUi, type Selection } from '../store/ui.ts';
import { cellKey, focusCellSoon } from './cells.ts';
import { chooseAndApplyImage } from './imageActions.ts';
import { IconImage, IconPlus, IconTrash } from '../ui/icons.tsx';

type ListRef = { kind: 'features' } | { kind: 'rows'; column: 0 | 1 } | { kind: 'logos' };

export interface Hover {
  target: Selection | null;
  list: ListRef | null;
}

const SIDE_GAP = 4;
const HANDLE = 28;
const HIDE_DELAY = 350;

/** Which editable item / list is under `el`? */
export function targetsFrom(el: Element | null): Hover {
  const item = el?.closest<HTMLElement>('[data-edit-item]');
  const image = el?.closest<HTMLElement>('[data-edit-image]');
  const list = el?.closest<HTMLElement>('[data-edit-list]');

  let target: Selection | null = null;
  if (item) {
    const id = item.dataset.id ?? '';
    const kind = item.dataset.editItem;
    if (kind === 'feature') target = { kind: 'feature', id };
    else if (kind === 'row')
      target = { kind: 'row', id, column: item.dataset.column === '1' ? 1 : 0 };
    else if (kind === 'logo') target = { kind: 'logo', id };
  } else if (image) {
    target = { kind: 'productImage' };
  }

  let listRef: ListRef | null = null;
  const listKind = list?.dataset.editList;
  if (listKind === 'features') listRef = { kind: 'features' };
  else if (listKind === 'rows')
    listRef = { kind: 'rows', column: list?.dataset.column === '1' ? 1 : 0 };
  else if (listKind === 'logos') listRef = { kind: 'logos' };
  return { target, list: listRef };
}

function elementFor(frame: HTMLElement, target: Selection): HTMLElement | null {
  switch (target.kind) {
    case 'feature':
      return frame.querySelector(`[data-edit-item="feature"][data-id="${CSS.escape(target.id)}"]`);
    case 'row':
      return frame.querySelector(`[data-edit-item="row"][data-id="${CSS.escape(target.id)}"]`);
    case 'logo':
      return frame.querySelector(`[data-edit-item="logo"][data-id="${CSS.escape(target.id)}"]`);
    case 'productImage':
      return frame.querySelector('[data-edit-image="product"]');
  }
}

function listElement(frame: HTMLElement, list: ListRef): HTMLElement | null {
  if (list.kind === 'features') return frame.querySelector('[data-edit-list="features"]');
  if (list.kind === 'logos') return frame.querySelector('[data-edit-list="logos"]');
  return frame.querySelector(`[data-edit-list="rows"][data-column="${list.column}"]`);
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function relative(el: HTMLElement, frame: HTMLElement): Box {
  const rect = el.getBoundingClientRect();
  const base = frame.getBoundingClientRect();
  return {
    left: rect.left - base.left,
    top: rect.top - base.top,
    right: rect.right - base.left,
    bottom: rect.bottom - base.top,
  };
}

interface Props {
  frameRef: RefObject<HTMLElement | null>;
  hover: Hover;
  /** Re-measure when the layout may have changed (content, zoom, resize). */
  layoutKey: unknown;
  keepAlive(active: boolean): void;
}

/**
 * Hover/selection handles for the sheet. They live in a layer on top of the sheet instead of inside it, so
 * adding controls can never move or resize anything in the printed layout. Positions are measured from the DOM.
 */
export function Overlay({ frameRef, hover, layoutKey, keepAlive }: Props): ReactElement | null {
  const selection = useUi((state) => state.selection);
  const content = useDoc((state) => state.content);
  const [boxes, setBoxes] = useState<{ target?: Box; list?: Box; listKind?: ListRef['kind'] }>({});

  const active = hover.target ?? selection;
  const list = hover.list;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const next: typeof boxes = {};
    if (active) {
      const el = elementFor(frame, active);
      if (el) next.target = relative(el, frame);
    }
    const listRef: ListRef | null =
      list ??
      (active?.kind === 'feature'
        ? { kind: 'features' }
        : active?.kind === 'row'
          ? { kind: 'rows', column: active.column }
          : active?.kind === 'logo'
            ? { kind: 'logos' }
            : null);
    if (listRef) {
      const el = listElement(frame, listRef);
      if (el) {
        next.list = relative(el, frame);
        next.listKind = listRef.kind;
      }
    }
    setBoxes((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
  }, [active, list, layoutKey, content, frameRef]);

  const store = useDoc.getState;
  const hold = { onPointerEnter: () => keepAlive(true), onPointerLeave: () => keepAlive(false) };

  const items: ReactElement[] = [];

  /* ----- handles for the active item ----- */
  if (active && boxes.target) {
    const box = boxes.target;
    if (active.kind === 'feature' || active.kind === 'row') {
      const onLeft = active.kind === 'row' && active.column === 0;
      const x = onLeft ? box.left - HANDLE - SIDE_GAP : box.right + SIDE_GAP;
      const add = () => {
        if (active.kind === 'feature') {
          const id = store().addFeature(active.id);
          focusCellSoon(cellKey({ kind: 'feature', id }));
        } else {
          const id = store().addRow(active.column, active.id);
          focusCellSoon(cellKey({ kind: 'row', column: active.column, id, part: 'label' }));
        }
      };
      const remove = () => {
        if (active.kind === 'feature') store().removeFeature(active.id);
        else store().removeRow(active.column, active.id);
        useUi.getState().select(null);
      };
      const noun = active.kind === 'feature' ? 'key feature' : 'row';
      items.push(
        <button
          key="remove"
          type="button"
          className="handle handle--danger"
          style={{ left: x, top: box.top }}
          aria-label={`Remove ${noun}`}
          title={`Remove ${noun}`}
          onClick={remove}
          {...hold}
        >
          <IconTrash />
        </button>,
        <button
          key="add"
          type="button"
          className="handle"
          style={{ left: x, top: box.top + HANDLE + 4 }}
          aria-label={`Add ${noun} below`}
          title={`Add ${noun} below`}
          onClick={add}
          {...hold}
        >
          <IconPlus />
        </button>,
      );
    } else if (active.kind === 'logo') {
      items.push(
        <button
          key="replace"
          type="button"
          className="handle"
          style={{ left: box.left - 6, top: box.top - HANDLE + 6 }}
          aria-label="Replace logo image"
          title="Replace image"
          onClick={() => void chooseAndApplyImage({ kind: 'logo', id: active.id })}
          {...hold}
        >
          <IconImage />
        </button>,
        <button
          key="remove"
          type="button"
          className="handle handle--danger"
          style={{ left: box.right - HANDLE + 6, top: box.top - HANDLE + 6 }}
          aria-label="Remove partner logo"
          title="Remove logo"
          onClick={() => {
            store().removePartnerLogo(active.id);
            useUi.getState().select(null);
          }}
          {...hold}
        >
          <IconTrash />
        </button>,
      );
    } else if (active.kind === 'productImage') {
      items.push(
        <button
          key="replace"
          type="button"
          className="handle"
          style={{ left: box.left + 6, top: box.top + 6 }}
          aria-label="Replace product image"
          title="Replace image"
          onClick={() => void chooseAndApplyImage({ kind: 'product' })}
          {...hold}
        >
          <IconImage />
        </button>,
        ...(content.productImage
          ? [
              <button
                key="remove"
                type="button"
                className="handle handle--danger"
                style={{ left: box.left + 6 + HANDLE + 4, top: box.top + 6 }}
                aria-label="Remove product image"
                title="Remove image"
                onClick={() => store().setProductImage(null)}
                {...hold}
              >
                <IconTrash />
              </button>,
            ]
          : []),
      );
    }
  }

  /* ----- "add" pills for lists ----- */
  const emptyFeatures = content.keyFeatures.length === 0;
  const showListPill = (kind: ListRef['kind'], empty: boolean) => empty || boxes.listKind === kind;

  const featuresBox = boxes.listKind === 'features' ? boxes.list : undefined;
  if (
    showListPill('features', emptyFeatures) &&
    featuresBox &&
    content.keyFeatures.length < LIMITS.keyFeatures
  ) {
    items.push(
      <button
        key="pill-features"
        type="button"
        className="pill"
        style={{ left: featuresBox.left, top: featuresBox.bottom + 2 }}
        onClick={() => {
          const id = store().addFeature();
          focusCellSoon(cellKey({ kind: 'feature', id }));
        }}
        {...hold}
      >
        <IconPlus /> Add feature
      </button>,
    );
  }
  if (boxes.listKind === 'rows' && boxes.list) {
    const column = list?.kind === 'rows' ? list.column : active?.kind === 'row' ? active.column : 0;
    if (content.specColumns[column].length < LIMITS.rowsPerColumn) {
      items.push(
        <button
          key="pill-rows"
          type="button"
          className="pill"
          style={{ left: boxes.list.left, top: boxes.list.bottom + 6 }}
          onClick={() => {
            const id = store().addRow(column);
            focusCellSoon(cellKey({ kind: 'row', column, id, part: 'label' }));
          }}
          {...hold}
        >
          <IconPlus /> Add row
        </button>,
      );
    }
  }
  if (
    boxes.listKind === 'logos' &&
    boxes.list &&
    content.partnerLogos.length < LIMITS.partnerLogos
  ) {
    items.push(
      <button
        key="pill-logos"
        type="button"
        className="pill"
        style={{
          left: Math.max(0, boxes.list.left - 96),
          top: boxes.list.top + (boxes.list.bottom - boxes.list.top - HANDLE) / 2,
        }}
        onClick={() => void chooseAndApplyImage({ kind: 'new-logo' })}
        {...hold}
      >
        <IconPlus /> Add logo
      </button>,
    );
  }

  return <div className="overlay">{items}</div>;
}

/** Small helper hook: hover tracking with a short hide delay so the pointer can travel to a handle. */
export function useHoverTracking() {
  const [hover, setHover] = useState<Hover>({ target: null, list: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const overOverlay = useRef(false);

  const clearSoon = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!overOverlay.current) setHover({ target: null, list: null });
    }, HIDE_DELAY);
  }, []);

  const onPointerOver = useCallback(
    (event: React.PointerEvent) => {
      const next = targetsFrom(event.target as Element);
      if (!next.target && !next.list) {
        clearSoon();
        return;
      }
      clearTimeout(timer.current);
      setHover((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    },
    [clearSoon],
  );

  const keepAlive = useCallback(
    (active: boolean) => {
      overOverlay.current = active;
      if (!active) clearSoon();
      else clearTimeout(timer.current);
    },
    [clearSoon],
  );

  return { hover, onPointerOver, onPointerLeave: clearSoon, keepAlive };
}
