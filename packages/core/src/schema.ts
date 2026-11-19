import * as v from 'valibot';
import { LIMITS } from './limits.ts';
import { charCount, type RichText } from './richtext.ts';

/* ---------- Rich text ---------- */

const RunSchema = v.strictObject({
  t: v.pipe(v.string(), v.maxLength(LIMITS.rowValue * 2)),
  b: v.optional(v.literal(true)),
  i: v.optional(v.literal(true)),
  u: v.optional(v.literal(true)),
});

const LineSchema = v.pipe(v.array(RunSchema), v.maxLength(LIMITS.runsPerLine));

/** A rich-text field limited to `maxChars` characters in total. */
export function richTextSchema(maxChars: number) {
  return v.pipe(
    v.array(LineSchema),
    v.maxLength(LIMITS.linesPerField),
    v.check((value) => charCount(value) <= maxChars, `Text is longer than ${maxChars} characters.`),
  );
}

/** True when `value` satisfies the structural caps and the character limit (same rules as the schema). */
export function richTextFits(value: RichText, maxChars: number): boolean {
  return (
    value.length <= LIMITS.linesPerField &&
    value.every((line) => line.length <= LIMITS.runsPerLine) &&
    charCount(value) <= maxChars
  );
}

/* ---------- Assets ---------- */

/** `builtin:<id>` ships with the app; `asset:<sha256>` is a user upload kept in the draft store. */
export const AssetRefSchema = v.pipe(
  v.string(),
  v.regex(/^(builtin:[a-z0-9][a-z0-9-]{0,47}|asset:[a-f0-9]{64})$/, 'Invalid asset reference.'),
);

/* ---------- Content ---------- */

const IdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

const FeatureSchema = v.strictObject({
  id: IdSchema,
  text: richTextSchema(LIMITS.featureText),
});

const RowSchema = v.strictObject({
  id: IdSchema,
  label: richTextSchema(LIMITS.rowLabel),
  value: richTextSchema(LIMITS.rowValue),
  /** Highlights the value (e.g. OS compatibility links) with the brand's strong accent. */
  emphasis: v.boolean(),
});

const PartnerLogoSchema = v.strictObject({
  id: IdSchema,
  ref: AssetRefSchema,
});

const ExtrasSchema = v.pipe(
  v.record(
    v.pipe(v.string(), v.maxLength(LIMITS.extrasKey)),
    v.union([
      v.pipe(v.string(), v.maxLength(LIMITS.extrasString)),
      v.number(),
      v.boolean(),
      v.null(),
    ]),
  ),
  v.check((value) => Object.keys(value).length <= LIMITS.extrasEntries, 'Too many extra fields.'),
);

export const SpecSheetContentSchema = v.strictObject({
  meta: v.strictObject({
    headerTitle: richTextSchema(LIMITS.headerTitle),
    title: richTextSchema(LIMITS.title),
    subtitle: richTextSchema(LIMITS.subtitle),
  }),
  partnerLogos: v.pipe(v.array(PartnerLogoSchema), v.maxLength(LIMITS.partnerLogos)),
  productImage: v.nullable(AssetRefSchema),
  keyFeatures: v.pipe(v.array(FeatureSchema), v.maxLength(LIMITS.keyFeatures)),
  applications: richTextSchema(LIMITS.applications),
  specColumns: v.tuple([
    v.pipe(v.array(RowSchema), v.maxLength(LIMITS.rowsPerColumn)),
    v.pipe(v.array(RowSchema), v.maxLength(LIMITS.rowsPerColumn)),
  ]),
  footer: v.strictObject({
    url: richTextSchema(LIMITS.footerUrl),
    disclaimer: richTextSchema(LIMITS.footerDisclaimer),
    copyright: richTextSchema(LIMITS.footerCopyright),
  }),
  /** Template-specific fields. Kept (never deleted) when the user switches templates. */
  extras: ExtrasSchema,
});

export type SpecSheetContent = v.InferOutput<typeof SpecSheetContentSchema>;
export type SpecRow = SpecSheetContent['specColumns'][number][number];
export type KeyFeature = SpecSheetContent['keyFeatures'][number];
export type PartnerLogo = SpecSheetContent['partnerLogos'][number];
export type AssetRef = v.InferOutput<typeof AssetRefSchema>;

/* ---------- Document envelope ---------- */

/** Current version of the content model. Bump together with a new migration. */
export const SCHEMA_VERSION = 1;

/** The model a template understands. Templates sharing a model can swap content freely. */
export const CONTENT_MODEL_SPEC_SHEET = 'spec-sheet@1';

export const DocumentSchema = v.strictObject({
  schemaVersion: v.literal(SCHEMA_VERSION),
  templateId: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]{0,47}$/)),
  templateVersion: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
  content: SpecSheetContentSchema,
});

export type SpecDocument = v.InferOutput<typeof DocumentSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

function formatIssues(issues: readonly v.BaseIssue<unknown>[]): string[] {
  return issues.slice(0, 12).map((issue) => {
    const path = issue.path?.map((p) => String(p.key)).join('.') ?? '';
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/** Validates a document of the CURRENT schema version. Use `migrateDocument` for untrusted/older input. */
export function parseDocument(input: unknown): ParseResult<SpecDocument> {
  const result = v.safeParse(DocumentSchema, input);
  return result.success
    ? { ok: true, value: result.output }
    : { ok: false, issues: formatIssues(result.issues) };
}

export function parseContent(input: unknown): ParseResult<SpecSheetContent> {
  const result = v.safeParse(SpecSheetContentSchema, input);
  return result.success
    ? { ok: true, value: result.output }
    : { ok: false, issues: formatIssues(result.issues) };
}
