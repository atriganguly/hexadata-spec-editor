import { classic } from './classic/entry.ts';
import type { TemplateEntry, TemplateMeta, TemplateModule } from './types.ts';

/**
 * ADD A TEMPLATE: create `src/<id>/` (entry.ts, module.ts, component, styles.css, defaults.ts),
 * then add its entry below. See docs/templates.md. Never reuse an id; bump `version` for breaking changes
 * and keep the older entry so existing drafts stay renderable.
 */
const ENTRIES: readonly TemplateEntry[] = [classic];

/** The template new drafts start from. */
export const DEFAULT_TEMPLATE_ID = 'classic';

function toMeta({ load: _load, ...meta }: TemplateEntry): TemplateMeta {
  return meta;
}

/** Latest version of every template, for pickers. Synchronous and cheap (no template code is loaded). */
export function listTemplates(): TemplateMeta[] {
  const latest = new Map<string, TemplateEntry>();
  for (const entry of ENTRIES) {
    const current = latest.get(entry.id);
    if (!current || entry.version > current.version) latest.set(entry.id, entry);
  }
  return [...latest.values()].map(toMeta);
}

function findEntry(id: string, version?: number): TemplateEntry | undefined {
  const candidates = ENTRIES.filter(
    (entry) => entry.id === id && (version === undefined || entry.version === version),
  );
  return candidates.sort((a, b) => b.version - a.version)[0];
}

/** Metadata of a template. Without `version`, the latest one. */
export function getTemplateMeta(id: string, version?: number): TemplateMeta | undefined {
  const entry = findEntry(id, version);
  return entry ? toMeta(entry) : undefined;
}

export interface LoadedTemplate extends TemplateMeta, TemplateModule {}

/** Loads a template's component, CSS and defaults. Resolves to undefined for unknown id/version. */
export async function loadTemplate(
  id: string,
  version?: number,
): Promise<LoadedTemplate | undefined> {
  const entry = findEntry(id, version);
  if (!entry) return undefined;
  const module = await entry.load();
  return { ...toMeta(entry), ...module };
}
