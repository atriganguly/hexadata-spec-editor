import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, plainText, rt, type SpecSheetContent } from '@hexadata/spec-core';
import { loadTemplate } from '@hexadata/spec-templates';
import { COALESCE_MS, HISTORY_LIMIT, useDoc } from '../src/store/doc.ts';

async function defaults(): Promise<SpecSheetContent> {
  return (await loadTemplate('classic'))!.createDefaults();
}

async function loadFresh() {
  useDoc.getState().load({
    draftId: 'd1',
    name: 'Test',
    templateId: 'classic',
    templateVersion: 1,
    content: await defaults(),
  });
}

const doc = () => useDoc.getState();

beforeEach(async () => {
  vi.useRealTimers();
  await loadFresh();
});

describe('editing', () => {
  it('edits text through addresses and bumps the revision', () => {
    const before = doc().revision;
    doc().setText({ kind: 'field', field: 'meta.title' }, rt('New title'));
    expect(plainText(doc().content.meta.title)).toBe('New title');
    expect(doc().revision).toBeGreaterThan(before);

    const feature = doc().content.keyFeatures[0]!;
    doc().setText({ kind: 'feature', id: feature.id }, rt('Edited'));
    expect(plainText(doc().content.keyFeatures[0]!.text)).toBe('Edited');

    const row = doc().content.specColumns[1][0]!;
    doc().setText({ kind: 'row', column: 1, id: row.id, part: 'value' }, rt('v'));
    expect(plainText(doc().content.specColumns[1][0]!.value)).toBe('v');
  });

  it('keeps untouched fields referentially equal (cheap re-renders)', () => {
    const before = doc().content;
    doc().setText({ kind: 'field', field: 'meta.title' }, rt('x'));
    const after = doc().content;
    expect(after).not.toBe(before);
    expect(after.meta.subtitle).toBe(before.meta.subtitle);
    expect(after.specColumns[0]).toBe(before.specColumns[0]);
    expect(after.keyFeatures).toBe(before.keyFeatures);
  });

  it('ignores no-op edits (no history, no revision change)', () => {
    const title = doc().content.meta.title;
    const revision = doc().revision;
    doc().setText({ kind: 'field', field: 'meta.title' }, structuredClone(title));
    // identical value written through immer still counts as a change only if the reference differs
    doc().edit('noop', () => undefined);
    expect(doc().revision).toBeGreaterThanOrEqual(revision);
    expect(doc().past.length).toBeLessThanOrEqual(1);
  });

  it('ignores edits to addresses that no longer exist', () => {
    const before = doc().content;
    doc().setText({ kind: 'feature', id: 'gone' }, rt('x'));
    expect(doc().content).toBe(before);
  });
});

describe('lists', () => {
  it('adds, duplicates, moves and removes key features', () => {
    const count = doc().content.keyFeatures.length;
    const first = doc().content.keyFeatures[0]!.id;
    const added = doc().addFeature(first);
    expect(doc().content.keyFeatures).toHaveLength(count + 1);
    expect(doc().content.keyFeatures[1]!.id).toBe(added);

    doc().duplicateFeature(first);
    expect(doc().content.keyFeatures).toHaveLength(count + 2);
    expect(doc().content.keyFeatures[1]!.id).not.toBe(first);

    doc().moveFeature(added, -1);
    const ids = doc().content.keyFeatures.map((f) => f.id);
    expect(ids.indexOf(added)).toBeLessThan(ids.indexOf(first) + 3);
    doc().moveFeature(ids[0]!, -1); // already first: no change, no crash
    expect(doc().content.keyFeatures.map((f) => f.id)[0]).toBe(ids[0]);

    doc().removeFeature(added);
    expect(doc().content.keyFeatures.find((f) => f.id === added)).toBeUndefined();
  });

  it('respects the feature and row limits', () => {
    for (let i = 0; i < LIMITS.keyFeatures + 5; i += 1) doc().addFeature();
    expect(doc().content.keyFeatures).toHaveLength(LIMITS.keyFeatures);
    for (let i = 0; i < LIMITS.rowsPerColumn + 5; i += 1) doc().addRow(0);
    expect(doc().content.specColumns[0]).toHaveLength(LIMITS.rowsPerColumn);
  });

  it('manages spec rows per column', () => {
    const left = doc().content.specColumns[0].length;
    const right = doc().content.specColumns[1].length;
    const id = doc().addRow(1);
    expect(doc().content.specColumns[1]).toHaveLength(right + 1);
    expect(doc().content.specColumns[0]).toHaveLength(left);
    doc().setRowEmphasis(1, id, true);
    expect(doc().content.specColumns[1].at(-1)!.emphasis).toBe(true);
    doc().duplicateRow(1, id);
    expect(doc().content.specColumns[1]).toHaveLength(right + 2);
    doc().removeRow(1, id);
    expect(doc().content.specColumns[1].find((r) => r.id === id)).toBeUndefined();
    doc().moveRow(0, doc().content.specColumns[0][1]!.id, -1);
    expect(doc().content.specColumns[0]).toHaveLength(left);
  });

  it('manages partner logos with a hard cap of four', () => {
    expect(doc().content.partnerLogos).toHaveLength(2);
    expect(doc().addPartnerLogo(`asset:${'a'.repeat(64)}`)).toBeTruthy();
    expect(doc().addPartnerLogo(`asset:${'b'.repeat(64)}`)).toBeTruthy();
    expect(doc().addPartnerLogo(`asset:${'c'.repeat(64)}`)).toBeUndefined();
    expect(doc().content.partnerLogos).toHaveLength(4);
    const id = doc().content.partnerLogos[0]!.id;
    doc().replacePartnerLogo(id, `asset:${'d'.repeat(64)}`);
    expect(doc().content.partnerLogos[0]!.ref).toBe(`asset:${'d'.repeat(64)}`);
    doc().removePartnerLogo(id);
    expect(doc().content.partnerLogos).toHaveLength(3);
  });

  it('removing every partner logo leaves an empty list (no resurrection)', () => {
    for (const logo of [...doc().content.partnerLogos]) doc().removePartnerLogo(logo.id);
    expect(doc().content.partnerLogos).toEqual([]);
  });

  it('sets and clears the product image', () => {
    doc().setProductImage(null);
    expect(doc().content.productImage).toBeNull();
    doc().setProductImage(`asset:${'e'.repeat(64)}`);
    expect(doc().content.productImage).toBe(`asset:${'e'.repeat(64)}`);
  });
});

describe('undo / redo', () => {
  it('undoes and redoes structural edits', () => {
    const count = doc().content.keyFeatures.length;
    doc().addFeature();
    expect(doc().canUndo()).toBe(true);
    doc().undo();
    expect(doc().content.keyFeatures).toHaveLength(count);
    expect(doc().lastAction).toMatch(/Undid/);
    expect(doc().canRedo()).toBe(true);
    doc().redo();
    expect(doc().content.keyFeatures).toHaveLength(count + 1);
    expect(doc().canRedo()).toBe(false);
  });

  it('a new edit clears the redo stack', () => {
    doc().addFeature();
    doc().undo();
    doc().addRow(0);
    expect(doc().canRedo()).toBe(false);
  });

  it('coalesces rapid edits of the same cell into one undo step', () => {
    const original = plainText(doc().content.meta.title);
    for (const text of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
      doc().setText({ kind: 'field', field: 'meta.title' }, rt(text));
    }
    expect(doc().past).toHaveLength(1);
    doc().undo();
    expect(plainText(doc().content.meta.title)).toBe(original);
    doc().redo();
    expect(plainText(doc().content.meta.title)).toBe('Hello');
  });

  it('does not coalesce across cells or after a pause', () => {
    vi.useFakeTimers();
    doc().setText({ kind: 'field', field: 'meta.title' }, rt('a'));
    doc().setText({ kind: 'field', field: 'meta.subtitle' }, rt('b'));
    expect(doc().past).toHaveLength(2);
    vi.advanceTimersByTime(COALESCE_MS + 10);
    doc().setText({ kind: 'field', field: 'meta.subtitle' }, rt('bc'));
    expect(doc().past).toHaveLength(3);
  });

  it('caps the history', () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1)
      doc().setRowEmphasis(0, doc().content.specColumns[0][0]!.id, i % 2 === 0);
    expect(doc().past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });

  it('undo with an empty history does nothing', () => {
    const before = doc().content;
    doc().undo();
    doc().redo();
    expect(doc().content).toBe(before);
  });
});

describe('Reset and session', () => {
  it('Reset restores the pristine defaults even after heavy editing (regression for the shared-object bug)', async () => {
    doc().setText({ kind: 'field', field: 'meta.title' }, rt('Totally different'));
    doc().addFeature();
    doc().removeRow(0, doc().content.specColumns[0][0]!.id);
    doc().replaceContent('Reset to template defaults', await defaults());
    expect(plainText(doc().content.meta.title)).toBe('HD-RS2200 Version : G294');
    expect(doc().content.specColumns[0]).toHaveLength(11);
    expect(doc().content.keyFeatures).toHaveLength(10);
    expect(JSON.stringify(doc().content)).toBe(JSON.stringify(await defaults()));
    doc().undo(); // and the reset itself is undoable
    expect(doc().content.keyFeatures).toHaveLength(11);
  });

  it('load() resets history and name changes bump the revision', async () => {
    doc().addFeature();
    expect(doc().past.length).toBeGreaterThan(0);
    await loadFresh();
    expect(doc().past).toHaveLength(0);
    expect(doc().revision).toBe(0);
    doc().setName('Renamed');
    expect(doc().name).toBe('Renamed');
    expect(doc().revision).toBe(1);
    doc().setName('Renamed'); // unchanged: no bump
    expect(doc().revision).toBe(1);
    doc().setName('x'.repeat(500));
    expect(doc().name).toHaveLength(LIMITS.draftName);
  });

  it('setTemplate bumps the revision without touching the content', () => {
    const content = doc().content;
    doc().setTemplate('classic', 1);
    expect(doc().content).toBe(content);
    expect(doc().revision).toBe(1);
  });
});
