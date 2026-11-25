import { useEffect, useMemo, type ReactElement } from 'react';
import { HexaLogo, Spinner } from '@hexadata/brand/react';
import { runExport } from './actions.ts';
import { Dialogs } from './Dialogs.tsx';
import { Header } from './Header.tsx';
import { registerServiceWorker } from './pwa.ts';
import { runtime } from './runtime.ts';
import { useSession } from '../drafts/session.ts';
import { FormatToolbar } from '../editor/FormatToolbar.tsx';
import { useShortcuts } from '../editor/shortcuts.ts';
import { Stage } from '../editor/Stage.tsx';
import { useTemplate, useTemplateStyles } from '../editor/useTemplate.ts';
import { API_BASE } from '../lib/env.ts';
import { warmEngine } from '../export/export-pdf.ts';
import { useEngineLayout } from '../export/layout-client.ts';
import { DraftsPanel } from '../panels/DraftsPanel.tsx';
import { Inspector } from '../panels/Inspector.tsx';
import { useDoc } from '../store/doc.ts';
import { useUi } from '../store/ui.ts';
import { Toasts } from '../ui/Toasts.tsx';
import { usePanels } from '../ui/usePanels.ts';

/** Keeps the chosen theme across visits (the brand's toggle itself persists nothing). */
function usePersistedTheme(): void {
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const theme = document.documentElement.getAttribute('data-theme');
      try {
        if (theme === 'light' || theme === 'dark') localStorage.setItem('hd-theme', theme);
      } catch {
        /* storage unavailable */
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
}

/** Saves on the way out and warns only when something is genuinely unsaved. */
function useSafeExit(): void {
  useEffect(() => {
    const { session } = runtime();
    const flush = () => void session.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const { saveStatus, readOnly } = useSession.getState();
      if (!readOnly && (saveStatus === 'saving' || saveStatus === 'error')) {
        flush();
        event.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);
}

function useServiceWorker(): void {
  useEffect(() => {
    registerServiceWorker({
      onUpdate: (apply) =>
        useUi.getState().toast('A new version is available.', {
          timeout: 0,
          action: { label: 'Reload', run: apply },
        }),
      onOfflineReady: () => useUi.getState().toast('Ready to work offline.', { tone: 'success' }),
    });
  }, []);
}

function BootScreen({ error }: { error?: string }): ReactElement {
  return (
    <div className="boot" role={error ? 'alert' : 'status'}>
      <HexaLogo form="centered" base="./brand/logo/" alt="HexaData" size="md" />
      {error ? (
        <>
          <p className="hd-alert hd-alert--danger" style={{ maxInlineSize: '32rem' }}>
            {error}
          </p>
          <button type="button" className="hd-btn" onClick={() => location.reload()}>
            Try again
          </button>
        </>
      ) : (
        <Spinner label="Opening your drafts" />
      )}
    </div>
  );
}

export function App(): ReactElement {
  const booted = useSession((state) => state.booted);
  const bootError = useSession((state) => state.bootError);
  const ready = useDoc((state) => state.ready);
  const templateId = useDoc((state) => state.templateId);
  const templateVersion = useDoc((state) => state.templateVersion);
  const announcement = useUi((state) => state.announcement);
  const { narrow, draftsOpen, inspectorOpen, closeAll } = usePanels();
  const template = useTemplate(templateId, templateVersion);
  useTemplateStyles(template?.css);
  usePersistedTheme();
  useEngineLayout();
  useSafeExit();
  useServiceWorker();

  useEffect(() => {
    void runtime().session.boot();
    warmEngine(API_BASE);
  }, []);

  const handlers = useMemo(
    () => ({
      save: () => void runtime().session.flush(),
      exportPdf: () => void runExport(),
      newDraft: () => useUi.getState().openDialog({ kind: 'new-draft' }),
    }),
    [],
  );
  useShortcuts(handlers);

  if (!booted || bootError || !ready || !template) return <BootScreen error={bootError} />;

  const scrim = narrow && (draftsOpen || inspectorOpen);

  return (
    <div className="app">
      <a className="hd-skip-link" href="#sheet">
        Skip to the sheet
      </a>
      <Header />
      <div className="app-body">
        {draftsOpen ? <DraftsPanel /> : <div hidden />}
        <main id="sheet" tabIndex={-1} style={{ display: 'contents' }}>
          <Stage template={template} />
        </main>
        {inspectorOpen ? <Inspector /> : <div hidden />}
        {scrim ? <div className="panel-scrim" aria-hidden="true" onClick={closeAll} /> : null}
      </div>
      <FormatToolbar />
      <Toasts />
      <Dialogs />
      <div className="hd-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}
