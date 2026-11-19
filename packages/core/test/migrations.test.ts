import { describe, expect, it } from 'vitest';
import { createEmptyContent, migrateDocument, plainText, SCHEMA_VERSION } from '../src/index.ts';

/** Trimmed copy of the pre-2.0 `defaultDocumentState` shape (HTML strings, data URLs, legacy logo fields). */
const legacy = () => ({
  images: {
    partnerLogos: ['data:image/webp;base64,AAAA', 'data:image/webp;base64,BBBB'],
    partnerLogo1: 'data:image/webp;base64,AAAA',
    partnerLogo2: 'data:image/webp;base64,BBBB',
    productImage: 'data:image/png;base64,CCCC',
    footerLogo: 'data:image/png;base64,DDDD',
  },
  meta: {
    headerTitle: 'HexaData Server System',
    title: 'HD-RS2200 Version : G294',
    subtitle: 'HPC/AI Server &amp; more',
  },
  keyFeatures: ['Supports up to 4 x Dual slot Gen5 GPUs', 'Dual <b>AMD EPYC™</b> Processors'],
  applications: 'AI Platform, AI Training Server\nVisual Computing...',
  specsLeft: [
    { label: 'Dimensions', value: '2U (W448 x H87.5 x D962 mm)' },
    { label: 'OS Compatibility', value: 'Please Refer to OS Compatibility Guide' },
  ],
  specsRight: [{ label: 'PCIe Expansion<br>Slots', value: '4 x FHFL<br>2 x LP' }],
  footer: {
    url: 'Learn more at: https://www.hexadata.in',
    disclaimer: '* subject to change',
    copyright: '© 2026',
  },
});

describe('migrateDocument', () => {
  it('upgrades the legacy shape to the current schema', () => {
    const result = migrateDocument(legacy());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { content } = result.value;
    expect(result.value.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.value.templateId).toBe('classic');
    expect(plainText(content.meta.subtitle)).toBe('HPC/AI Server & more');
    expect(content.keyFeatures).toHaveLength(2);
    expect(content.keyFeatures[1]!.text).toEqual([
      [{ t: 'Dual ' }, { t: 'AMD EPYC™', b: true }, { t: ' Processors' }],
    ]);
    expect(plainText(content.applications)).toBe(
      'AI Platform, AI Training Server\nVisual Computing...',
    );
    expect(content.specColumns[0]).toHaveLength(2);
    expect(content.specColumns[1]).toHaveLength(1);
    expect(plainText(content.specColumns[1][0]!.label)).toBe('PCIe Expansion\nSlots');
  });

  it('marks OS Compatibility rows as emphasised', () => {
    const result = migrateDocument(legacy());
    if (!result.ok) throw new Error(result.issues.join());
    const [dimensions, os] = result.value.content.specColumns[0];
    expect(dimensions!.emphasis).toBe(false);
    expect(os!.emphasis).toBe(true);
  });

  it('drops the legacy partnerLogo1/2 fields and replaces data URLs with shipped assets', () => {
    const result = migrateDocument(legacy());
    if (!result.ok) throw new Error(result.issues.join());
    expect(result.value.content.partnerLogos.map((l) => l.ref)).toEqual([
      'builtin:partner-logo-1',
      'builtin:partner-logo-2',
    ]);
    expect(result.value.content.productImage).toBe('builtin:product-placeholder');
    expect(JSON.stringify(result.value)).not.toContain('data:');
    expect(JSON.stringify(result.value)).not.toContain('partnerLogo1');
  });

  it('does not resurrect logos the user deleted (empty list stays empty)', () => {
    const input = legacy();
    input.images.partnerLogos = [];
    // The old server fell back to partnerLogo1/2 here; the migration must not.
    input.images.partnerLogo1 = '';
    input.images.partnerLogo2 = '';
    const result = migrateDocument(input);
    if (!result.ok) throw new Error(result.issues.join());
    expect(result.value.content.partnerLogos).toEqual([]);
  });

  it('never carries HTML or scripts through', () => {
    const input = legacy();
    input.meta.title = '<img src=x onerror=alert(1)><script>alert(2)</script>Title';
    const result = migrateDocument(input);
    if (!result.ok) throw new Error(result.issues.join());
    expect(plainText(result.value.content.meta.title)).toBe('Title');
  });

  it('accepts a current-version document unchanged', () => {
    const current = {
      schemaVersion: SCHEMA_VERSION,
      templateId: 'classic',
      templateVersion: 1,
      content: createEmptyContent(),
    };
    const result = migrateDocument(current);
    expect(result).toEqual({ ok: true, value: current });
  });

  it('rejects unknown, future and malformed input without throwing', () => {
    for (const bad of [
      null,
      5,
      'x',
      [],
      {},
      { schemaVersion: 99 },
      { schemaVersion: -1 },
      { schemaVersion: 1.5 },
    ]) {
      expect(migrateDocument(bad).ok).toBe(false);
    }
  });

  it('survives hostile legacy values', () => {
    const result = migrateDocument({
      keyFeatures: [null, 1, { a: 1 }],
      specsLeft: 'nope',
      specsRight: [null, 7],
      images: 5,
      meta: 'x',
      footer: [],
    });
    expect(result.ok).toBe(true);
  });
});
