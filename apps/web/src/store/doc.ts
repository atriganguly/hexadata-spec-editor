import { create } from 'zustand';
import { applyPatches, current, enablePatches, produceWithPatches, type Patch } from 'immer';
import {
  createFeature,
  createPartnerLogo,
  createRow,
  LIMITS,
  newId,
  type AssetRef,
  type RichText,
  type SpecSheetContent,
} from '@hexadata/spec-core';
import type { TextAddress } from '@hexadata/spec-templates';

enablePatches();

/** Undo steps kept per editing session. */
export const HISTORY_LIMIT = 200;
/** Edits to the same target within this window are merged into one undo step (typing). */
export const COALESCE_MS = 1000;

interface HistoryEntry {
  patches: Patch[];
  inverse: Patch[];
  label: string;
  coalesceKey?: string;
  at: number;
}

export interface DocSnapshot {
  draftId: string;
  name: string;
  templateId: string;
  templateVersion: number;
  content: SpecSheetContent;
}

export type Column = 0 | 1;

interface DocState extends Partial<DocSnapshot> {
  /** True once a draft is loaded. */
  ready: boolean;
  content: SpecSheetContent;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Increments on every change that should be saved (content, name, template). */
  revision: number;
  /** Label of the last undo/redo step, for the live region ("Undid: Edit title"). */
  lastAction: string;

  load(snapshot: DocSnapshot): void;
  clear(): void;

  /** Applies `recipe` to the content as one undoable step. */
  edit(
    label: string,
    recipe: (draft: SpecSheetContent) => void,
    options?: { coalesceKey?: string },
  ): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  setName(name: string): void;
  setTemplate(templateId: string, templateVersion: number): void;
  replaceContent(label: string, content: SpecSheetContent): void;

  setText(address: TextAddress, value: RichText): void;
  addFeature(afterId?: string): string;
  removeFeature(id: string): void;
  moveFeature(id: string, delta: -1 | 1): void;
  duplicateFeature(id: string): void;
  addRow(column: Column, afterId?: string): string;
  removeRow(column: Column, id: string): void;
  moveRow(column: Column, id: string, delta: -1 | 1): void;
  duplicateRow(column: Column, id: string): void;
  setRowEmphasis(column: Column, id: string, emphasis: boolean): void;
  setProductImage(ref: AssetRef | null): void;
  addPartnerLogo(ref: AssetRef): string | undefined;
  replacePartnerLogo(id: string, ref: AssetRef): void;
  removePartnerLogo(id: string): void;
}

const emptyContent = (): SpecSheetContent => ({
  meta: { headerTitle: [], title: [], subtitle: [] },
  partnerLogos: [],
  productImage: null,
  keyFeatures: [],
  applications: [],
  specColumns: [[], []],
  footer: { url: [], disclaimer: [], copyright: [] },
  extras: {},
});

function move<T>(list: T[], index: number, delta: -1 | 1): void {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item!);
}

function textTarget(
  draft: SpecSheetContent,
  address: TextAddress,
): { get(): RichText; set(v: RichText): void } | undefined {
  switch (address.kind) {
    case 'field': {
      const [group, key] = address.field.split('.') as [string, string | undefined];
      if (key) {
        const bag = draft[group as 'meta' | 'footer'] as Record<string, RichText>;
        return { get: () => bag[key]!, set: (v) => void (bag[key] = v) };
      }
      const root = draft as unknown as Record<string, RichText>;
      return { get: () => root[group]!, set: (v) => void (root[group] = v) };
    }
    case 'feature': {
      const feature = draft.keyFeatures.find((f) => f.id === address.id);
      return feature ? { get: () => feature.text, set: (v) => void (feature.text = v) } : undefined;
    }
    case 'row': {
      const row = draft.specColumns[address.column].find((r) => r.id === address.id);
      return row
        ? { get: () => row[address.part], set: (v) => void (row[address.part] = v) }
        : undefined;
    }
  }
}

/** Stable key for coalescing edits of the same cell. */
export const addressKey = (a: TextAddress): string =>
  a.kind === 'field'
    ? `field:${a.field}`
    : a.kind === 'feature'
      ? `feature:${a.id}`
      : `row:${a.column}:${a.id}:${a.part}`;

const LABELS: Record<string, string> = {
  'meta.headerTitle': 'header title',
  'meta.title': 'title',
  'meta.subtitle': 'subtitle',
  applications: 'applications',
  'footer.url': 'footer link',
  'footer.disclaimer': 'disclaimer',
  'footer.copyright': 'copyright',
};

export function describeAddress(a: TextAddress): string {
  if (a.kind === 'field') return LABELS[a.field] ?? a.field;
  if (a.kind === 'feature') return 'key feature';
  return a.part === 'label' ? 'row label' : 'row value';
}

export const useDoc = create<DocState>()((set, get) => {
  const commit = (
    label: string,
    recipe: (draft: SpecSheetContent) => void,
    options: { coalesceKey?: string } = {},
  ): boolean => {
    const state = get();
    const [next, patches, inverse] = produceWithPatches(state.content, recipe);
    if (patches.length === 0) return false;

    const now = Date.now();
    const past = state.past.slice();
    const last = past[past.length - 1];
    if (
      options.coalesceKey &&
      last &&
      last.coalesceKey === options.coalesceKey &&
      now - last.at < COALESCE_MS &&
      state.future.length === 0
    ) {
      past[past.length - 1] = {
        ...last,
        patches: [...last.patches, ...patches],
        inverse: [...inverse, ...last.inverse],
        at: now,
      };
    } else {
      past.push({ patches, inverse, label, coalesceKey: options.coalesceKey, at: now });
      if (past.length > HISTORY_LIMIT) past.shift();
    }
    set({ content: next, past, future: [], revision: state.revision + 1 });
    return true;
  };

  return {
    ready: false,
    content: emptyContent(),
    past: [],
    future: [],
    revision: 0,
    lastAction: '',

    load(snapshot) {
      set({
        ...snapshot,
        ready: true,
        past: [],
        future: [],
        revision: 0,
        lastAction: '',
      });
    },
    clear() {
      set({
        ready: false,
        draftId: undefined,
        name: undefined,
        templateId: undefined,
        templateVersion: undefined,
        content: emptyContent(),
        past: [],
        future: [],
        revision: 0,
        lastAction: '',
      });
    },

    edit: (label, recipe, options) => void commit(label, recipe, options),

    undo() {
      const { past, future, content, revision } = get();
      const entry = past[past.length - 1];
      if (!entry) return;
      set({
        content: applyPatches(content, entry.inverse),
        past: past.slice(0, -1),
        future: [entry, ...future],
        revision: revision + 1,
        lastAction: `Undid: ${entry.label}`,
      });
    },
    redo() {
      const { past, future, content, revision } = get();
      const entry = future[0];
      if (!entry) return;
      set({
        content: applyPatches(content, entry.patches),
        past: [...past, entry],
        future: future.slice(1),
        revision: revision + 1,
        lastAction: `Redid: ${entry.label}`,
      });
    },
    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    setName(name) {
      const trimmed = name.slice(0, LIMITS.draftName);
      if (trimmed === get().name) return;
      set((state) => ({ name: trimmed, revision: state.revision + 1 }));
    },
    setTemplate(templateId, templateVersion) {
      set((state) => ({ templateId, templateVersion, revision: state.revision + 1 }));
    },
    replaceContent(label, content) {
      commit(label, (draft) => {
        Object.assign(draft, structuredClone(content));
      });
    },

    setText(address, value) {
      commit(
        `Edit ${describeAddress(address)}`,
        (draft) => {
          textTarget(draft, address)?.set(value);
        },
        { coalesceKey: addressKey(address) },
      );
    },

    addFeature(afterId) {
      const feature = createFeature();
      commit('Add key feature', (draft) => {
        if (draft.keyFeatures.length >= LIMITS.keyFeatures) return;
        const index = afterId ? draft.keyFeatures.findIndex((f) => f.id === afterId) : -1;
        draft.keyFeatures.splice(index === -1 ? draft.keyFeatures.length : index + 1, 0, feature);
      });
      return feature.id;
    },
    removeFeature(id) {
      commit('Remove key feature', (draft) => {
        draft.keyFeatures = draft.keyFeatures.filter((f) => f.id !== id);
      });
    },
    moveFeature(id, delta) {
      commit('Move key feature', (draft) => {
        move(
          draft.keyFeatures,
          draft.keyFeatures.findIndex((f) => f.id === id),
          delta,
        );
      });
    },
    duplicateFeature(id) {
      commit('Duplicate key feature', (draft) => {
        const index = draft.keyFeatures.findIndex((f) => f.id === id);
        if (index === -1 || draft.keyFeatures.length >= LIMITS.keyFeatures) return;
        draft.keyFeatures.splice(index + 1, 0, {
          id: newId(),
          text: current(draft.keyFeatures[index]!).text,
        });
      });
    },

    addRow(column, afterId) {
      const row = createRow();
      commit('Add row', (draft) => {
        const rows = draft.specColumns[column];
        if (rows.length >= LIMITS.rowsPerColumn) return;
        const index = afterId ? rows.findIndex((r) => r.id === afterId) : -1;
        rows.splice(index === -1 ? rows.length : index + 1, 0, row);
      });
      return row.id;
    },
    removeRow(column, id) {
      commit('Remove row', (draft) => {
        draft.specColumns[column] = draft.specColumns[column].filter((r) => r.id !== id);
      });
    },
    moveRow(column, id, delta) {
      commit('Move row', (draft) => {
        const rows = draft.specColumns[column];
        move(
          rows,
          rows.findIndex((r) => r.id === id),
          delta,
        );
      });
    },
    duplicateRow(column, id) {
      commit('Duplicate row', (draft) => {
        const rows = draft.specColumns[column];
        const index = rows.findIndex((r) => r.id === id);
        if (index === -1 || rows.length >= LIMITS.rowsPerColumn) return;
        const source = rows[index]!;
        rows.splice(index + 1, 0, {
          id: newId(),
          label: current(source).label,
          value: current(source).value,
          emphasis: source.emphasis,
        });
      });
    },
    setRowEmphasis(column, id, emphasis) {
      commit('Toggle highlight', (draft) => {
        const row = draft.specColumns[column].find((r) => r.id === id);
        if (row) row.emphasis = emphasis;
      });
    },

    setProductImage(ref) {
      commit(ref ? 'Replace product image' : 'Remove product image', (draft) => {
        draft.productImage = ref;
      });
    },
    addPartnerLogo(ref) {
      const logo = createPartnerLogo(ref);
      let added = false;
      commit('Add partner logo', (draft) => {
        if (draft.partnerLogos.length >= LIMITS.partnerLogos) return;
        draft.partnerLogos.push(logo);
        added = true;
      });
      return added ? logo.id : undefined;
    },
    replacePartnerLogo(id, ref) {
      commit('Replace partner logo', (draft) => {
        const logo = draft.partnerLogos.find((l) => l.id === id);
        if (logo) logo.ref = ref;
      });
    },
    removePartnerLogo(id) {
      commit('Remove partner logo', (draft) => {
        draft.partnerLogos = draft.partnerLogos.filter((l) => l.id !== id);
      });
    },
  };
});
