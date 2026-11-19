import { useEffect, useState, type ReactElement } from 'react';
import { HexaLogo, Spinner, ThemeToggle } from '@hexadata/brand/react';
import { listTemplates } from '@hexadata/spec-templates';
import { LIMITS } from '@hexadata/spec-core';
import { cancelExport, confirmReset, requestTemplateSwitch, runExport } from './actions.ts';
import { runtime } from './runtime.ts';
import { useSession } from '../drafts/session.ts';
import { downloadBlob } from '../export/export-pdf.ts';
import { timeAgo } from '../lib/format.ts';
import { useDoc } from '../store/doc.ts';
import { useUi } from '../store/ui.ts';
import { useMedia, usePanels } from '../ui/usePanels.ts';
import { Menu, type MenuEntry } from '../ui/Menu.tsx';
import {
  IconDatabase,
  IconDownload,
  IconFile,
  IconFilePlus,
  IconInfo,
  IconKeyboard,
  IconMore,
  IconPanelLeft,
  IconPanelRight,
  IconRedo,
  IconRotate,
  IconTrash,
  IconUndo,
  IconUpload,
  IconCopy,
} from '../ui/icons.tsx';

function SaveStatus(): ReactElement {
  const status = useSession((state) => state.saveStatus);
  const error = useSession((state) => state.saveError);
  const readOnly = useSession((state) => state.readOnly);
  const lastSavedAt = useSession((state) => state.lastSavedAt);
  const [, tick] = useState(0);

  // Keep "Saved 2 min ago" fresh.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (readOnly) {
    return (
      <span className="save-status" data-state="error" role="status">
        <span className="save-dot" /> Read only
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="save-status" data-state="error" role="alert">
        <span className="save-dot" />
        <span title={error}>Not saved</span>
        <button
          type="button"
          className="hd-btn hd-btn--ghost hd-btn--sm"
          style={{ minBlockSize: '1.5rem' }}
          onClick={() => void runtime().session.retry()}
        >
          Retry
        </button>
      </span>
    );
  }
  const label =
    status === 'saving'
      ? 'Saving…'
      : status === 'saved' && lastSavedAt
        ? `Saved ${timeAgo(lastSavedAt)}`
        : lastSavedAt
          ? `Saved ${timeAgo(lastSavedAt)}`
          : 'Autosave on';
  return (
    <span
      className="save-status"
      data-state={status === 'saving' ? 'saving' : 'saved'}
      role="status"
    >
      <span className="save-dot" /> {label}
    </span>
  );
}

function DraftName(): ReactElement {
  const name = useDoc((state) => state.name) ?? '';
  const setName = useDoc((state) => state.setName);
  const readOnly = useSession((state) => state.readOnly);
  const [draft, setDraft] = useState<string | undefined>();

  return (
    <input
      className="name-input"
      aria-label="Draft name"
      value={draft ?? name}
      maxLength={LIMITS.draftName}
      readOnly={readOnly}
      placeholder="Untitled spec sheet"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        setDraft(event.target.value);
        setName(event.target.value);
      }}
      onBlur={() => {
        if (draft !== undefined && !draft.trim()) setName('Untitled spec sheet');
        setDraft(undefined);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
      }}
    />
  );
}

function TemplatePicker(): ReactElement {
  const templateId = useDoc((state) => state.templateId) ?? '';
  const readOnly = useSession((state) => state.readOnly);
  const templates = listTemplates();
  return (
    <div
      className="hide-sm"
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--hd-space-2)' }}
    >
      <label htmlFor="template-select" className="hd-eyebrow hide-md" style={{ margin: 0 }}>
        Template
      </label>
      <select
        id="template-select"
        className="hd-select"
        style={{ inlineSize: 'auto', minBlockSize: '2.25rem', paddingBlock: '0.25rem' }}
        value={templateId}
        disabled={readOnly}
        aria-label="Template"
        onChange={(event) => requestTemplateSwitch(event.target.value)}
      >
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ExportButton(): ReactElement {
  const exporting = useUi((state) => state.exporting);
  const busy = exporting !== 'idle';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hd-space-2)' }}>
      {busy ? (
        <button type="button" className="hd-btn hd-btn--ghost hd-btn--sm" onClick={cancelExport}>
          Cancel
        </button>
      ) : null}
      <button
        type="button"
        className="hd-btn"
        style={{ minBlockSize: '2.5rem' }}
        aria-disabled={busy}
        aria-busy={busy}
        title="Export PDF (Ctrl+Shift+E)"
        onClick={() => void runExport()}
      >
        {busy ? <Spinner label="Exporting" /> : <IconDownload width={18} height={18} />}
        <span className="hide-sm">
          {exporting === 'waking'
            ? 'Waking PDF engine…'
            : exporting === 'rendering'
              ? 'Exporting…'
              : 'Export PDF'}
        </span>
      </button>
    </div>
  );
}

export function Header(): ReactElement {
  const canUndo = useDoc((state) => state.past.length > 0);
  const canRedo = useDoc((state) => state.future.length > 0);
  const undo = useDoc((state) => state.undo);
  const redo = useDoc((state) => state.redo);
  const readOnly = useSession((state) => state.readOnly);
  const { draftsOpen, inspectorOpen, setDraftsOpen, setInspectorOpen } = usePanels();
  const openDialog = useUi((state) => state.openDialog);
  const currentId = useSession((state) => state.currentId);

  const small = useMedia('(max-width: 47.99rem)');
  const { session } = runtime();

  const toggleTheme = () => {
    const root = document.documentElement;
    const current =
      root.getAttribute('data-theme') ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  };

  // On small screens the header keeps only what is needed most; the rest lives in this menu.
  const compactEntries: MenuEntry[] = small
    ? [
        { label: 'Undo', icon: <IconUndo />, disabled: !canUndo || readOnly, onSelect: undo },
        { label: 'Redo', icon: <IconRedo />, disabled: !canRedo || readOnly, onSelect: redo },
        {
          label: inspectorOpen ? 'Hide inspector' : 'Show inspector',
          icon: <IconPanelRight />,
          onSelect: () => setInspectorOpen(!inspectorOpen),
        },
        { label: 'Switch light / dark theme', icon: <IconRotate />, onSelect: toggleTheme },
      ]
    : [];

  const entries: MenuEntry[] = [
    ...compactEntries.map((entry, index) =>
      index === compactEntries.length - 1 ? { ...entry } : entry,
    ),
    {
      label: 'New draft',
      icon: <IconFilePlus />,
      separator: compactEntries.length > 0,
      shortcut: 'Ctrl+Alt+N',
      onSelect: () => openDialog({ kind: 'new-draft' }),
    },
    {
      label: 'Duplicate draft',
      icon: <IconCopy />,
      disabled: !currentId,
      onSelect: () => currentId && void session.duplicate(currentId),
    },
    {
      label: 'Download draft file',
      icon: <IconFile />,
      onSelect: async () => {
        const file = await session.exportCurrentDraft();
        if (file)
          downloadBlob(
            new Blob([file.bytes as BlobPart], { type: 'application/zip' }),
            file.fileName,
          );
      },
    },
    { label: 'Import…', icon: <IconUpload />, onSelect: () => openDialog({ kind: 'import' }) },
    {
      label: 'Download backup of all drafts',
      icon: <IconDatabase />,
      onSelect: () => openDialog({ kind: 'storage' }),
    },
    {
      label: 'Reset sheet to template defaults',
      icon: <IconRotate />,
      separator: true,
      disabled: readOnly,
      onSelect: confirmReset,
    },
    {
      label: 'Trash',
      icon: <IconTrash />,
      separator: true,
      onSelect: () => openDialog({ kind: 'trash' }),
    },
    {
      label: 'Keyboard shortcuts',
      icon: <IconKeyboard />,
      shortcut: '?',
      onSelect: () => openDialog({ kind: 'shortcuts' }),
    },
    { label: 'About', icon: <IconInfo />, onSelect: () => openDialog({ kind: 'about' }) },
  ];

  return (
    <header className="app-header">
      <button
        type="button"
        className="icon-btn"
        aria-label={draftsOpen ? 'Hide drafts panel' : 'Show drafts panel'}
        aria-pressed={draftsOpen}
        title="Drafts"
        onClick={() => setDraftsOpen(!draftsOpen)}
      >
        <IconPanelLeft />
      </button>
      <div className="app-header__brand">
        <HexaLogo
          form="horizontal"
          size="sm"
          base="./brand/logo/"
          alt="HexaData"
          className="hide-sm"
        />
        <HexaLogo
          form="icon"
          size="sm"
          base="./brand/logo/"
          alt="HexaData"
          className="hide-md-up"
        />
      </div>
      <span className="app-divider hide-sm" aria-hidden="true" />
      <div className="app-header__name">
        <DraftName />
      </div>
      <div className="hide-sm">
        <SaveStatus />
      </div>

      <div className="app-header__actions">
        <TemplatePicker />
        <span className="app-divider hide-sm" aria-hidden="true" />
        <button
          type="button"
          className="icon-btn hide-sm"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo || readOnly}
          onClick={undo}
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="icon-btn hide-sm"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo || readOnly}
          onClick={redo}
        >
          <IconRedo />
        </button>
        <Menu label="More actions" trigger={<IconMore />} entries={entries} />
        <span className="hide-sm">
          <ThemeToggle appearance="icon" label="Toggle light and dark theme" className="icon-btn" />
        </span>
        <button
          type="button"
          className="icon-btn hide-sm"
          aria-label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          aria-pressed={inspectorOpen}
          title="Inspector"
          onClick={() => setInspectorOpen(!inspectorOpen)}
        >
          <IconPanelRight />
        </button>
        <ExportButton />
      </div>
    </header>
  );
}
