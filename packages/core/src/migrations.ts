import { newId } from './ids.ts';
import { legacyHtmlToRichText, type RichText } from './richtext.ts';
import { LIMITS } from './limits.ts';
import { parseDocument, SCHEMA_VERSION, type ParseResult, type SpecDocument } from './schema.ts';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Shipped replacements for the data-URL images of the pre-2.0 default sheet. */
const LEGACY_IMAGE_FALLBACKS = {
  partnerLogos: ['builtin:partner-logo-1', 'builtin:partner-logo-2'],
  productImage: 'builtin:product-placeholder',
} as const;

function legacyRow(input: unknown): SpecDocument['content']['specColumns'][number][number] {
  const row = isObject(input) ? input : {};
  const labelHtml = asString(row.label);
  return {
    id: newId(),
    label: legacyHtmlToRichText(labelHtml),
    value: legacyHtmlToRichText(asString(row.value)),
    emphasis: /OS Compatibility/i.test(labelHtml),
  };
}

/** Image values of the old editor were data URLs; a pure function can only recover the shipped defaults. */
function hasImage(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

/**
 * v0 -> v1. The v0 shape is the original `defaultDocumentState`: HTML strings, `specsLeft` /
 * `specsRight`, data-URL images, and the `partnerLogo1/2` fallback fields. Those fallback fields are
 * dropped (they made deleted logos reappear in PDFs). User-supplied data-URL images cannot be
 * recovered by a pure function; they fall back to the shipped defaults.
 */
function migrateV0(input: Json): Json {
  const images = isObject(input.images) ? input.images : {};
  const meta = isObject(input.meta) ? input.meta : {};
  const footer = isObject(input.footer) ? input.footer : {};
  const legacyLogos = asArray(images.partnerLogos);
  const partnerLogos =
    legacyLogos.length > 0 ? legacyLogos : [images.partnerLogo1, images.partnerLogo2];

  const logos = partnerLogos
    .map((logo, index): string | null =>
      hasImage(logo)
        ? (LEGACY_IMAGE_FALLBACKS.partnerLogos[index] ?? LEGACY_IMAGE_FALLBACKS.partnerLogos[0])
        : null,
    )
    .filter((ref): ref is string => ref !== null)
    .slice(0, LIMITS.partnerLogos)
    .map((ref) => ({ id: newId(), ref }));

  const textField = (value: unknown): RichText => legacyHtmlToRichText(asString(value));

  return {
    schemaVersion: 1,
    templateId: 'classic',
    templateVersion: 1,
    content: {
      meta: {
        headerTitle: textField(meta.headerTitle),
        title: textField(meta.title),
        subtitle: textField(meta.subtitle),
      },
      partnerLogos: logos,
      productImage: hasImage(images.productImage) ? LEGACY_IMAGE_FALLBACKS.productImage : null,
      keyFeatures: asArray(input.keyFeatures)
        .slice(0, LIMITS.keyFeatures)
        .map((feature) => ({ id: newId(), text: textField(feature) })),
      applications: textField(input.applications),
      specColumns: [
        asArray(input.specsLeft).slice(0, LIMITS.rowsPerColumn).map(legacyRow),
        asArray(input.specsRight).slice(0, LIMITS.rowsPerColumn).map(legacyRow),
      ],
      footer: {
        url: textField(footer.url),
        disclaimer: textField(footer.disclaimer),
        copyright: textField(footer.copyright),
      },
      extras: {},
    },
  };
}

/**
 * Ordered migrations. `migrations[n]` upgrades schema version n to n + 1.
 * Adding a version means: bump SCHEMA_VERSION, append a function here, add a fixture test.
 */
const migrations: Array<(input: Json) => Json> = [migrateV0];

function detectVersion(input: Json): number | null {
  if (typeof input.schemaVersion === 'number') return input.schemaVersion;
  if ('specsLeft' in input || 'specsRight' in input || 'keyFeatures' in input) return 0;
  return null;
}

/**
 * Upgrades any supported document (current or older) to the current schema and validates it.
 * Never throws; returns issues instead. Use for draft import and for server requests.
 */
export function migrateDocument(input: unknown): ParseResult<SpecDocument> {
  if (!isObject(input)) return { ok: false, issues: ['Document must be an object.'] };
  let version = detectVersion(input);
  if (version === null) return { ok: false, issues: ['Unrecognised document format.'] };
  if (!Number.isInteger(version) || version < 0 || version > SCHEMA_VERSION) {
    return { ok: false, issues: [`Unsupported schema version ${String(version)}.`] };
  }
  let current: Json = input;
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) return { ok: false, issues: [`No migration from schema version ${version}.`] };
    current = step(current);
    version += 1;
  }
  return parseDocument(current);
}
