import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
} from 'react';
import type { LoadedTemplate } from '@hexadata/spec-templates';
import { useSession } from '../drafts/session.ts';
import { useDoc } from '../store/doc.ts';
import { clampZoom, useUi, type Selection } from '../store/ui.ts';
import { applyImageFile, chooseAndApplyImage } from './imageActions.ts';
import { measureSheet } from './layout.ts';
import { detectLayoutScale } from './scale-css.ts';
import { Overlay, targetsFrom, useHoverTracking } from './Overlay.tsx';
import { Sheet } from './Sheet.tsx';
import { ZoomControls } from './ZoomControls.tsx';
import { runtime } from '../app/runtime.ts';

const MM_TO_PX = 96 / 25.4;
const STAGE_GUTTER = 2; // the frame's own 1px borders

/** The A4 canvas: zoomable, fits the window, hosts the sheet and its overlay. */
export function Stage({ template }: { template: LoadedTemplate }): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const zoomMode = useUi((state) => state.zoom);
  const setZoomFactor = useUi((state) => state.setZoomFactor);
  const readOnly = useSession((state) => state.readOnly);
  const content = useDoc((state) => state.content);
  const { hover, onPointerOver, onPointerLeave, keepAlive } = useHoverTracking();

  const pageWidth = template.page.widthMm * MM_TO_PX;
  const pages = useUi((state) => state.layout.pages);
  // 1 normally; 4 in a browser that enforces a minimum font size (see scale-css.ts).
  const layoutScale = detectLayoutScale();
  const pageHeight = template.page.heightMm * MM_TO_PX;

  // Fit modes follow the stage size.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      // Usable area = client box minus the stage padding (the vertical scrollbar is already excluded).
      const style = getComputedStyle(el);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setSize({ width: el.clientWidth - padX, height: el.clientHeight - padY });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitWidth = (size.width - STAGE_GUTTER) / pageWidth;
  const fitPage = Math.min(fitWidth, (size.height - STAGE_GUTTER) / pageHeight);
  const factor =
    size.width === 0
      ? 1
      : clampZoom(
          zoomMode === 'fit-width' ? fitWidth : zoomMode === 'fit-page' ? fitPage : zoomMode,
        );

  useEffect(() => setZoomFactor(factor), [factor, setZoomFactor]);

  // Ctrl/Cmd + wheel zooms the sheet (and not the whole page).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const current = useUi.getState().zoomFactor;
      useUi.getState().setZoom(clampZoom(current * Math.exp(-event.deltaY * 0.01)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Page breaks and layout problems. Re-measured whenever something that changes row heights or the table position
  // may have happened: content edits, a resize, fonts finishing to load, images loading, a table growing or shrinking.
  const [layoutTick, setLayoutTick] = useState(0);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let raf = 0;
    const observer = new ResizeObserver(() => run());
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // The PDF engine's answer for this very content wins over the local estimate (see useEngineLayout).
        const doc = useDoc.getState();
        const engine = useUi.getState().engine;
        const engineIsCurrent =
          engine?.content === doc.content &&
          engine.templateId === doc.templateId &&
          engine.templateVersion === doc.templateVersion;
        const layout = engineIsCurrent ? engine.layout : measureSheet(frame, template, content);
        if (layout) useUi.getState().setLayout(layout);
        frame.querySelectorAll('[data-hd-flow]').forEach((flow) => observer.observe(flow));
        setLayoutTick((tick) => tick + 1);
      });
    };
    run();
    observer.observe(frame);
    document.fonts?.addEventListener('loadingdone', run);
    frame.addEventListener('load', run, true); // images (do not bubble: capture)
    void document.fonts?.ready.then(run);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', run);
      frame.removeEventListener('load', run, true);
    };
  }, [content, template]);

  // Mark the selected element (outline) without touching React-managed props.
  const selection = useUi((state) => state.selection);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.querySelectorAll('[data-selected]').forEach((el) => el.removeAttribute('data-selected'));
    if (!selection) return;
    const selector =
      selection.kind === 'productImage'
        ? '[data-edit-image="product"]'
        : `[data-edit-item="${selection.kind}"][data-id="${CSS.escape(selection.id)}"]`;
    frame.querySelector(selector)?.setAttribute('data-selected', 'true');
  }, [selection, content]);

  const select = (next: Selection | null) => useUi.getState().select(next);

  // Image slots: click to replace, drop a file to set.
  const onClick = (event: React.MouseEvent) => {
    const { target } = targetsFrom(event.target as Element);
    select(target);
    if (readOnly) return;
    if (target?.kind === 'productImage') void chooseAndApplyImage({ kind: 'product' });
    else if (target?.kind === 'logo') void chooseAndApplyImage({ kind: 'logo', id: target.id });
  };

  const onFocus = (event: React.FocusEvent) => {
    const { target } = targetsFrom(event.target as Element);
    if (target) select(target);
  };

  const onDragOver = (event: DragEvent) => {
    if (readOnly || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (event: DragEvent) => {
    if (readOnly) return;
    const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    const hit = targetsFrom(document.elementFromPoint(event.clientX, event.clientY));
    if (hit.target?.kind === 'productImage') void applyImageFile(file, { kind: 'product' });
    else if (hit.target?.kind === 'logo')
      void applyImageFile(file, { kind: 'logo', id: hit.target.id });
    else if (hit.list?.kind === 'logos') void applyImageFile(file, { kind: 'new-logo' });
    else void applyImageFile(file, { kind: 'product' });
  };

  const takeOver = () => void runtime().session.takeOver();

  return (
    <div className="stage-wrap">
      {readOnly ? (
        <div className="stage-banner" role="status">
          <span style={{ flex: 1 }}>
            This draft is open in another tab, so it is read-only here.
          </span>
          <button type="button" className="hd-btn hd-btn--secondary hd-btn--sm" onClick={takeOver}>
            Edit here instead
          </button>
        </div>
      ) : null}
      <div
        className="stage"
        ref={stageRef}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) select(null);
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div
          ref={frameRef}
          className="frame"
          // Event delegation container only; every editable part inside is a real, focusable control.
          role="presentation"
          data-readonly={readOnly}
          style={{ width: pageWidth * factor, height: pageHeight * pages * factor }}
          onPointerOver={onPointerOver}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
          onFocusCapture={onFocus}
        >
          <div
            className="sheet-scale"
            // Laid out `layoutScale` times larger and scaled back (see scale-css.ts); `--lz` keeps editing chrome crisp.
            style={{
              width: pageWidth * layoutScale,
              height: pageHeight * pages * layoutScale,
              transform: `scale(${factor / layoutScale})`,
              ['--lz' as string]: layoutScale,
            }}
          >
            <Sheet template={template} />
          </div>
          {Array.from({ length: pages - 1 }, (_, i) => (
            <div
              key={i}
              className="page-break"
              aria-hidden="true"
              style={{ top: pageHeight * (i + 1) * factor }}
            />
          ))}
          {readOnly ? null : (
            <Overlay
              frameRef={frameRef}
              hover={hover}
              layoutKey={`${factor}:${layoutTick}`}
              keepAlive={keepAlive}
            />
          )}
        </div>
      </div>
      <ZoomControls />
    </div>
  );
}
