import { describe, expect, it } from 'vitest';
import {
  CONTENT_MODEL_SPEC_SHEET,
  createEmptyContent,
  createFeature,
  createPartnerLogo,
  createRow,
  LIMITS,
  parseContent,
  parseDocument,
  rt,
  SCHEMA_VERSION,
} from '../src/index.ts';

const doc = (content = createEmptyContent()) => ({
  schemaVersion: SCHEMA_VERSION,
  templateId: 'classic',
  templateVersion: 1,
  content,
});

describe('content factories', () => {
  it('return fresh, valid objects every time (no shared state)', () => {
    const a = createEmptyContent();
    const b = createEmptyContent();
    expect(a).toEqual(b);
    a.specColumns[0].push(createRow());
    expect(b.specColumns[0]).toHaveLength(0);
    expect(parseContent(createEmptyContent()).ok).toBe(true);
  });

  it('give every item a unique id', () => {
    const ids = new Set([
      createRow().id,
      createRow().id,
      createFeature().id,
      createPartnerLogo('builtin:x').id,
    ]);
    expect(ids.size).toBe(4);
  });

  it('exposes the content model name templates declare', () => {
    expect(CONTENT_MODEL_SPEC_SHEET).toBe('spec-sheet@1');
  });
});

describe('parseDocument', () => {
  it('accepts an empty document', () => {
    expect(parseDocument(doc()).ok).toBe(true);
  });

  it('rejects unknown keys (strict)', () => {
    const content = { ...createEmptyContent(), evil: 1 };
    expect(parseDocument(doc(content as never)).ok).toBe(false);
  });

  it('rejects a wrong schema version', () => {
    expect(parseDocument({ ...doc(), schemaVersion: 99 }).ok).toBe(false);
  });

  it('rejects bad template ids', () => {
    expect(parseDocument({ ...doc(), templateId: '../etc' }).ok).toBe(false);
    expect(parseDocument({ ...doc(), templateId: 'Classic' }).ok).toBe(false);
  });

  it('only allows b, i, u marks with literal true', () => {
    const content = createEmptyContent();
    content.applications = [[{ t: 'x', b: true }]];
    expect(parseDocument(doc(content)).ok).toBe(true);
    const bad = createEmptyContent() as unknown as { applications: unknown };
    bad.applications = [[{ t: 'x', color: 'red' }]];
    expect(parseDocument(doc(bad as never)).ok).toBe(false);
    bad.applications = [[{ t: 'x', b: 'yes' }]];
    expect(parseDocument(doc(bad as never)).ok).toBe(false);
  });

  it('enforces text length limits', () => {
    const content = createEmptyContent();
    content.meta.title = rt('x'.repeat(LIMITS.title));
    expect(parseDocument(doc(content)).ok).toBe(true);
    content.meta.title = rt('x'.repeat(LIMITS.title + 1));
    const result = parseDocument(doc(content));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(' ')).toContain('meta.title');
  });

  it('enforces list limits', () => {
    const content = createEmptyContent();
    content.partnerLogos = Array.from({ length: LIMITS.partnerLogos + 1 }, () =>
      createPartnerLogo('builtin:a'),
    );
    expect(parseDocument(doc(content)).ok).toBe(false);
    content.partnerLogos = [];
    content.keyFeatures = Array.from({ length: LIMITS.keyFeatures + 1 }, () => createFeature());
    expect(parseDocument(doc(content)).ok).toBe(false);
  });

  it('only allows builtin ids and sha256 asset references', () => {
    const content = createEmptyContent();
    for (const ok of ['builtin:product-placeholder', `asset:${'a'.repeat(64)}`]) {
      content.productImage = ok;
      expect(parseDocument(doc(content)).ok, ok).toBe(true);
    }
    for (const bad of [
      'data:image/png;base64,AAAA',
      'http://169.254.169.254/latest',
      'https://example.com/x.png',
      'asset:short',
      'builtin:../../etc/passwd',
      'file:///etc/passwd',
    ]) {
      content.productImage = bad;
      expect(parseDocument(doc(content)).ok, bad).toBe(false);
    }
  });

  it('limits extras', () => {
    const content = createEmptyContent();
    content.extras = Object.fromEntries(
      Array.from({ length: LIMITS.extrasEntries + 1 }, (_, i) => [`k${i}`, 'v']),
    );
    expect(parseDocument(doc(content)).ok).toBe(false);
    content.extras = { nested: { a: 1 } } as never;
    expect(parseDocument(doc(content)).ok).toBe(false);
  });

  it('reports readable issues without throwing on garbage input', () => {
    for (const garbage of [null, undefined, 1, 'x', [], {}]) {
      const result = parseDocument(garbage);
      expect(result.ok).toBe(false);
    }
  });
});
