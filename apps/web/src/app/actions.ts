import { hiddenFieldsAfterSwitch, getTemplateMeta, loadTemplate } from '@hexadata/spec-templates';
import { runtime } from './runtime.ts';
import { API_BASE } from '../lib/env.ts';
import { downloadBlob, exportPdf, ExportError } from '../export/export-pdf.ts';
import { useDoc } from '../store/doc.ts';
import { useUi } from '../store/ui.ts';
import { formatBytes } from '../lib/format.ts';

/** App-level actions shared by the header, menus, dialogs and keyboard shortcuts. */

let activeExport: AbortController | undefined;

export function cancelExport(): void {
  activeExport?.abort();
}

export async function runExport(): Promise<void> {
  const ui = useUi.getState();
  if (ui.exporting !== 'idle') return;

  // Content that cannot be laid out (more pages than allowed, a row taller than a page) would be refused by the
  // PDF engine: say so here, with the reason.
  const [problem] = ui.issues;
  if (problem) {
    ui.toast(problem.message, { tone: 'danger' });
    return;
  }

  const { session, store } = runtime();
  const snapshot = await session.currentSnapshot();
  if (!snapshot) return;

  const controller = new AbortController();
  activeExport = controller;
  ui.setExporting('rendering');
  ui.announce('Exporting PDF…');
  try {
    const { blob, fileName } = await exportPdf(
      {
        templateId: snapshot.templateId,
        templateVersion: snapshot.templateVersion,
        content: snapshot.content,
      },
      store,
      {
        apiBase: API_BASE,
        signal: controller.signal,
        onPhase: (phase) => useUi.getState().setExporting(phase),
      },
    );
    downloadBlob(blob, fileName);
    useUi
      .getState()
      .toast(`Downloaded ${fileName} (${formatBytes(blob.size)})`, { tone: 'success' });
    useUi.getState().announce('PDF downloaded.');
  } catch (error) {
    if (error instanceof ExportError && error.code === 'cancelled') {
      useUi.getState().toast('Export cancelled.');
    } else {
      const message =
        error instanceof ExportError ? error.message : 'The PDF could not be generated.';
      const retryable = !(error instanceof ExportError) || error.retryable;
      useUi.getState().toast(message, {
        tone: 'danger',
        action: retryable ? { label: 'Try again', run: () => void runExport() } : undefined,
      });
    }
  } finally {
    activeExport = undefined;
    useUi.getState().setExporting('idle');
  }
}

/** Asks before switching to a template that would hide filled-in content; switches directly otherwise. */
export function requestTemplateSwitch(templateId: string): void {
  const doc = useDoc.getState();
  if (templateId === doc.templateId) return;
  const meta = getTemplateMeta(templateId);
  if (!meta) return;
  const hidden = hiddenFieldsAfterSwitch(doc.content, meta);
  if (hidden.length > 0) {
    useUi
      .getState()
      .openDialog({ kind: 'switch-template', templateId, templateName: meta.name, hidden });
    return;
  }
  void runtime().session.switchTemplate(templateId);
}

/** Replaces the content with the template's pristine defaults (one undoable step). */
export async function resetToTemplateDefaults(): Promise<void> {
  const doc = useDoc.getState();
  const template = await loadTemplate(doc.templateId ?? 'classic', doc.templateVersion);
  if (!template) return;
  doc.replaceContent('Reset to template defaults', template.createDefaults());
  useUi.getState().select(null);
  useUi.getState().toast('Sheet reset to the template defaults.', {
    action: { label: 'Undo', run: () => useDoc.getState().undo() },
  });
}

export function confirmReset(): void {
  useUi.getState().openDialog({
    kind: 'confirm',
    title: 'Reset this sheet?',
    body: 'All text and images in this draft are replaced with the template’s sample content. You can undo this right after.',
    confirmLabel: 'Reset sheet',
    danger: true,
    onConfirm: () => void resetToTemplateDefaults(),
  });
}
