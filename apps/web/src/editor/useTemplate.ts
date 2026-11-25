import { useEffect, useState } from 'react';
import { detectLayoutScale, scaleCss } from './scale-css.ts';
import { loadTemplate, slotCss, type LoadedTemplate } from '@hexadata/spec-templates';

/**
 * Loads a template (code-split) and keeps showing the previous one until the next is ready, so switching
 * templates never flashes an empty page.
 */
export function useTemplate(
  id: string | undefined,
  version: number | undefined,
): LoadedTemplate | undefined {
  const [template, setTemplate] = useState<LoadedTemplate>();
  const [failed, setFailed] = useState<string>();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadTemplate(id, version)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) setFailed(`Unknown template "${id}".`);
        else {
          setFailed(undefined);
          setTemplate(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setFailed(error instanceof Error ? error.message : 'The template could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  if (failed) throw new Error(failed);
  return template;
}

let installed: CSSStyleSheet | undefined;

/**
 * Applies the shared slot CSS and the template's CSS with a constructable stylesheet (allowed under a strict
 * `style-src 'self'` policy, unlike an injected <style> element). The same CSS strings are what the PDF
 * renderer uses.
 */
export function useTemplateStyles(css: string | undefined): void {
  useEffect(() => {
    if (css === undefined || !('adoptedStyleSheets' in document)) return;
    const sheet = new CSSStyleSheet();
    // Larger lengths when the browser enforces a minimum font size, so the editor wraps like the PDF.
    sheet.replaceSync(scaleCss(`${slotCss}\n${css}`, detectLayoutScale()));
    const previous = installed;
    document.adoptedStyleSheets = [
      ...document.adoptedStyleSheets.filter((s) => s !== previous),
      sheet,
    ];
    installed = sheet;
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
      if (installed === sheet) installed = undefined;
    };
  }, [css]);
}
