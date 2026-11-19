import { create } from 'zustand';
import type { SheetField } from '@hexadata/spec-templates';
import type { OverflowIssue } from '../editor/overflow.ts';

export type ZoomMode = 'fit-width' | 'fit-page' | number;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.1;

export type Selection =
  | { kind: 'feature'; id: string }
  | { kind: 'row'; id: string; column: 0 | 1 }
  | { kind: 'logo'; id: string }
  | { kind: 'productImage' };

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; run(): void };
  /** Milliseconds; 0 keeps it until dismissed. */
  timeout: number;
}

export type DialogState =
  | { kind: 'new-draft' }
  | { kind: 'trash' }
  | { kind: 'import' }
  | { kind: 'shortcuts' }
  | { kind: 'storage' }
  | { kind: 'about' }
  | {
      kind: 'confirm';
      title: string;
      body: string;
      confirmLabel: string;
      danger?: boolean;
      onConfirm(): void;
    }
  | { kind: 'switch-template'; templateId: string; templateName: string; hidden: SheetField[] }
  | { kind: 'export-issues'; messages: string[]; onConfirm(): void };

interface PersistedUi {
  zoom: ZoomMode;
  /** null = automatic (open on wide screens, closed on narrow ones) until the user chooses. */
  draftsOpen: boolean | null;
  inspectorOpen: boolean | null;
}

const STORAGE_KEY = 'hd-ui';

function readPersisted(): Partial<PersistedUi> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as Partial<PersistedUi>;
    const zoom =
      value.zoom === 'fit-width' || value.zoom === 'fit-page'
        ? value.zoom
        : typeof value.zoom === 'number' && value.zoom >= ZOOM_MIN && value.zoom <= ZOOM_MAX
          ? value.zoom
          : undefined;
    return {
      zoom,
      draftsOpen: typeof value.draftsOpen === 'boolean' ? value.draftsOpen : null,
      inspectorOpen: typeof value.inspectorOpen === 'boolean' ? value.inspectorOpen : null,
    };
  } catch {
    return {};
  }
}

function persist(state: PersistedUi): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: preferences just do not persist */
  }
}

export const clampZoom = (value: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));

interface UiState extends PersistedUi {
  /** The zoom factor actually applied (resolved from `zoom` by the stage). */
  zoomFactor: number;
  selection: Selection | null;
  toasts: Toast[];
  dialog: DialogState | null;
  /** Bumped on every openDialog so each open remounts the dialog (a stale, already-closed one is never reused). */
  dialogSeq: number;
  /** Polite live-region message for assistive technology. */
  announcement: string;
  exporting: 'idle' | 'rendering' | 'waking';
  /** Layout problems found on the sheet (content colliding with the footer, running off the page). */
  issues: OverflowIssue[];

  setZoom(zoom: ZoomMode): void;
  setZoomFactor(factor: number): void;
  setDraftsOpen(open: boolean): void;
  setInspectorOpen(open: boolean): void;
  select(selection: Selection | null): void;
  toast(
    message: string,
    options?: { tone?: ToastTone; action?: Toast['action']; timeout?: number },
  ): number;
  dismissToast(id: number): void;
  openDialog(dialog: DialogState): void;
  closeDialog(): void;
  announce(message: string): void;
  setExporting(state: UiState['exporting']): void;
  setIssues(issues: OverflowIssue[]): void;
}

let toastId = 0;
const initial = readPersisted();

export const useUi = create<UiState>()((set, get) => {
  const save = () => {
    const { zoom, draftsOpen, inspectorOpen } = get();
    persist({ zoom, draftsOpen, inspectorOpen });
  };
  return {
    zoom: initial.zoom ?? 'fit-width',
    draftsOpen: initial.draftsOpen ?? null,
    inspectorOpen: initial.inspectorOpen ?? null,
    zoomFactor: 1,
    selection: null,
    toasts: [],
    dialog: null,
    dialogSeq: 0,
    announcement: '',
    exporting: 'idle',
    issues: [],

    setZoom(zoom) {
      set({ zoom: typeof zoom === 'number' ? clampZoom(zoom) : zoom });
      save();
    },
    setZoomFactor: (zoomFactor) => set({ zoomFactor }),
    setDraftsOpen(open) {
      set({ draftsOpen: open });
      save();
    },
    setInspectorOpen(open) {
      set({ inspectorOpen: open });
      save();
    },
    select: (selection) => set({ selection }),

    toast(message, options = {}) {
      const id = ++toastId;
      const tone = options.tone ?? 'neutral';
      const timeout = options.timeout ?? (tone === 'danger' ? 0 : options.action ? 8000 : 4000);
      set((state) => ({
        toasts: [...state.toasts.slice(-3), { id, tone, message, action: options.action, timeout }],
      }));
      return id;
    },
    dismissToast: (id) =>
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
    openDialog: (dialog) => set({ dialog, dialogSeq: get().dialogSeq + 1 }),
    closeDialog: () => set({ dialog: null }),
    announce: (announcement) => set({ announcement }),
    setExporting: (exporting) => set({ exporting }),
    setIssues: (issues) =>
      set((state) =>
        JSON.stringify(state.issues) === JSON.stringify(issues) ? state : { issues },
      ),
  };
});
