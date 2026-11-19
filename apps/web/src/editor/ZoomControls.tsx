import type { ReactElement } from 'react';
import { clampZoom, useUi, ZOOM_STEP } from '../store/ui.ts';
import { IconFit, IconZoomIn, IconZoomOut } from '../ui/icons.tsx';

/** Floating zoom pill at the bottom of the canvas (keeps the header uncluttered). */
export function ZoomControls(): ReactElement {
  const zoomMode = useUi((state) => state.zoom);
  const factor = useUi((state) => state.zoomFactor);
  const setZoom = useUi((state) => state.setZoom);
  const fitWidth = zoomMode === 'fit-width';
  return (
    <div className="zoom-pill" role="group" aria-label="Zoom">
      <button
        type="button"
        className="icon-btn"
        aria-label="Zoom out"
        title="Zoom out (Ctrl+−)"
        onClick={() => setZoom(clampZoom(factor - ZOOM_STEP))}
      >
        <IconZoomOut />
      </button>
      <button
        type="button"
        className="zoom-readout zoom-readout--button"
        aria-label={`Zoom ${Math.round(factor * 100)} percent. Reset to fit width`}
        title="Fit width (Ctrl+0)"
        onClick={() => setZoom('fit-width')}
      >
        {Math.round(factor * 100)}%
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Zoom in"
        title="Zoom in (Ctrl++)"
        onClick={() => setZoom(clampZoom(factor + ZOOM_STEP))}
      >
        <IconZoomIn />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={fitWidth ? 'Fit whole page' : 'Fit page width'}
        title={fitWidth ? 'Fit whole page' : 'Fit page width'}
        aria-pressed={zoomMode === 'fit-width' || zoomMode === 'fit-page'}
        onClick={() => setZoom(fitWidth ? 'fit-page' : 'fit-width')}
      >
        <IconFit />
      </button>
    </div>
  );
}
