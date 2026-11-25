import { useRef, useState, type DragEvent, type ReactElement } from 'react';
import { TextField } from '@hexadata/brand/react';
import { BRAND_REVISION } from '@hexadata/brand';
import { LIMITS } from '@hexadata/spec-core';
import { fieldLabel, listTemplates } from '@hexadata/spec-templates';
import { runtime } from './runtime.ts';
import { downloadBlob } from '../export/export-pdf.ts';
import { ImportError, MAX_IMPORT_BYTES } from '../drafts/hxspec.ts';
import { TRASH_RETENTION_MS, useSession } from '../drafts/session.ts';
import { APP_VERSION } from '../lib/env.ts';
import { daysLeft, formatBytes, timeAgo } from '../lib/format.ts';
import { useUi, type DialogState } from '../store/ui.ts';
import { SHORTCUTS } from '../editor/shortcuts.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { IconAlert, IconDatabase, IconRestore, IconTrash, IconUpload } from '../ui/icons.tsx';

function Actions({ children }: { children: React.ReactNode }): ReactElement {
  return <div className="dialog-actions">{children}</div>;
}

/* ------------------------------------------------------------------ new draft */

function NewDraftDialog({ close }: { close(): void }): ReactElement {
  const [name, setName] = useState('Untitled spec sheet');
  const [busy, setBusy] = useState(false);
  const templates = listTemplates();

  const create = async (templateId: string) => {
    setBusy(true);
    try {
      await runtime().session.createNew({ templateId, name: name.trim() || 'Untitled spec sheet' });
      close();
    } catch (error) {
      useUi
        .getState()
        .toast(error instanceof Error ? error.message : 'The draft could not be created.', {
          tone: 'danger',
        });
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="New draft"
      description="Choose a template. You can change the template later without losing your content."
      onClose={close}
      wide
    >
      <div className="hd-stack">
        <TextField
          label="Draft name"
          value={name}
          maxLength={LIMITS.draftName}
          onChange={(event) => setName(event.target.value)}
        />
        <ul className="template-grid" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className="template-card"
                style={{ inlineSize: '100%' }}
                disabled={busy}
                onClick={() => void create(template.id)}
              >
                <span className="template-card__name">{template.name}</span>
                <span className="template-card__desc">{template.description}</span>
                <span className="hd-badge">
                  {template.page.size} · {template.page.widthMm}×{template.page.heightMm} mm
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ trash */

function TrashDialog({ close }: { close(): void }): ReactElement {
  const trash = useSession((state) => state.trash);
  const { session } = runtime();
  const [armed, setArmed] = useState<string>();

  return (
    <Dialog
      title="Trash"
      description={`Drafts are kept for ${Math.round(TRASH_RETENTION_MS / 86_400_000)} days, then deleted for good.`}
      onClose={close}
    >
      {trash.length === 0 ? (
        <div className="empty-state">
          <p style={{ margin: 0 }}>The trash is empty.</p>
        </div>
      ) : (
        <ul className="hd-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {trash.map((meta) => (
            <li key={meta.id} className="hd-card" style={{ padding: 'var(--hd-space-3)' }}>
              <div
                className="hd-cluster"
                style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}
              >
                <div style={{ minInlineSize: 0 }}>
                  <strong
                    style={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {meta.name}
                  </strong>
                  <span className="hd-help">
                    Deleted {timeAgo(meta.deletedAt ?? 0)} ·{' '}
                    {daysLeft(meta.deletedAt ?? 0, TRASH_RETENTION_MS)} days left
                  </span>
                </div>
                <div className="hd-cluster" style={{ flexWrap: 'nowrap' }}>
                  <button
                    type="button"
                    className="hd-btn hd-btn--secondary hd-btn--sm"
                    onClick={() => void session.restore(meta.id)}
                  >
                    <IconRestore width={14} height={14} /> Restore
                  </button>
                  <button
                    type="button"
                    className={`hd-btn hd-btn--sm ${armed === meta.id ? 'hd-btn--danger' : 'hd-btn--ghost'}`}
                    onClick={() => {
                      if (armed === meta.id) {
                        setArmed(undefined);
                        void session.deletePermanently(meta.id);
                      } else setArmed(meta.id);
                    }}
                    onBlur={() => setArmed(undefined)}
                  >
                    <IconTrash width={14} height={14} />{' '}
                    {armed === meta.id ? 'Confirm: delete forever' : 'Delete'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Actions>
        {trash.length > 0 ? (
          <button
            type="button"
            className="hd-btn hd-btn--danger hd-btn--sm"
            onClick={() =>
              useUi.getState().openDialog({
                kind: 'confirm',
                title: 'Empty the trash?',
                body: `${trash.length} draft${trash.length === 1 ? '' : 's'} will be deleted permanently. This cannot be undone.`,
                confirmLabel: 'Delete forever',
                danger: true,
                onConfirm: () => void session.emptyTrash(),
              })
            }
          >
            Empty trash
          </button>
        ) : null}
        <button type="button" className="hd-btn" onClick={close}>
          Done
        </button>
      </Actions>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ import */

function ImportDialog({ close }: { close(): void }): ReactElement {
  const { session } = runtime();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ count: number; warnings: string[]; firstId?: string }>();
  const input = useRef<HTMLInputElement>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    setResult(undefined);
    if (file.size > MAX_IMPORT_BYTES) {
      setError('That file is larger than 50 MB.');
      return;
    }
    setBusy(true);
    try {
      setResult(await session.importBytes(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'That file could not be imported.');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    void handle(event.dataTransfer.files[0]);
  };

  return (
    <Dialog
      title="Import drafts"
      description="Open a .hxspec draft file or a backup you downloaded earlier. Imported drafts are added as new drafts; nothing is overwritten."
      onClose={close}
    >
      <label
        className="dropzone"
        data-over={over}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <IconUpload width={28} height={28} />
        <strong>{busy ? 'Importing…' : 'Drop a file here, or click to choose'}</strong>
        <span className="hd-help">.hxspec draft or backup (up to 50 MB)</span>
        <input
          ref={input}
          type="file"
          className="hd-sr-only"
          accept=".hxspec,.zip,application/zip"
          onChange={(event) => {
            void handle(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      {error ? (
        <p
          className="hd-alert hd-alert--danger"
          role="alert"
          style={{ marginBlockStart: 'var(--hd-space-4)' }}
        >
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="hd-stack" style={{ marginBlockStart: 'var(--hd-space-4)' }} role="status">
          <p className="hd-alert hd-alert--success" style={{ margin: 0 }}>
            Imported {result.count} draft{result.count === 1 ? '' : 's'}.
          </p>
          {result.warnings.map((warning) => (
            <p key={warning} className="issue">
              <IconAlert />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      ) : null}
      <Actions>
        {result?.firstId ? (
          <button
            type="button"
            className="hd-btn hd-btn--secondary"
            onClick={() => {
              void session.open(result.firstId!);
              close();
            }}
          >
            Open it
          </button>
        ) : null}
        <button type="button" className="hd-btn" onClick={close}>
          Done
        </button>
      </Actions>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ shortcuts */

function ShortcutsDialog({ close }: { close(): void }): ReactElement {
  const groups = ['Document', 'Text', 'Lists', 'View'] as const;
  return (
    <Dialog
      title="Keyboard shortcuts"
      description="On macOS use ⌘ in place of Ctrl."
      onClose={close}
      wide
    >
      <div className="hd-stack">
        {groups.map((group) => (
          <section key={group}>
            <h3 className="hd-eyebrow">{group}</h3>
            <table className="hd-table">
              <tbody>
                {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
                  <tr key={shortcut.keys}>
                    <td style={{ inlineSize: '45%' }}>
                      <kbd>{shortcut.keys}</kbd>
                    </td>
                    <td>{shortcut.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <Actions>
        <button type="button" className="hd-btn" onClick={close}>
          Close
        </button>
      </Actions>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ storage */

function StorageDialog({ close }: { close(): void }): ReactElement {
  const storage = useSession((state) => state.storage);
  const drafts = useSession((state) => state.drafts);
  const { session } = runtime();
  const pct =
    storage.usage !== undefined && storage.quota
      ? Math.min(100, (storage.usage / storage.quota) * 100)
      : undefined;

  const backup = async () => {
    const result = await session.exportEverything();
    if (!result) {
      useUi.getState().toast('There are no drafts to back up.');
      return;
    }
    downloadBlob(
      new Blob([result.bytes as BlobPart], { type: 'application/zip' }),
      `hexadata-drafts-backup-${new Date().toISOString().slice(0, 10)}.zip`,
    );
    useUi
      .getState()
      .toast(`Backup of ${result.count} draft${result.count === 1 ? '' : 's'} downloaded.`, {
        tone: 'success',
      });
  };

  const requestPersistent = async () => {
    const toast = useUi.getState().toast;
    if (!navigator.storage?.persist) {
      toast('This browser does not support persistent storage.', { tone: 'warning' });
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      await session.refreshStorage();
      if (granted) {
        toast('Persistent storage granted. The browser will not clear your drafts to free space.', {
          tone: 'success',
        });
      } else {
        toast(
          'The browser declined. It decides on its own, often based on how much you use the site or whether it is installed or bookmarked. Download a backup regularly instead.',
          { tone: 'warning', timeout: 10_000 },
        );
      }
    } catch {
      toast('Persistent storage could not be requested. Download a backup regularly instead.', {
        tone: 'warning',
      });
    }
  };

  return (
    <Dialog
      title="Storage"
      description="Drafts live in this browser, on this device. They are never uploaded; a PDF export sends only the sheet being exported."
      onClose={close}
    >
      <div className="hd-stack">
        {pct !== undefined ? (
          <div>
            <div
              className="meter"
              role="img"
              aria-label={`${pct.toFixed(1)} percent of browser storage used`}
              data-high={pct > 80}
            >
              <span style={{ inlineSize: `${Math.max(1, pct)}%` }} />
            </div>
            <p className="hd-help">
              {formatBytes(storage.usage ?? 0)} used of about {formatBytes(storage.quota ?? 0)} ·{' '}
              {drafts.length} draft{drafts.length === 1 ? '' : 's'}
            </p>
          </div>
        ) : (
          <p className="hd-help">This browser does not report storage usage.</p>
        )}
        {pct !== undefined && pct > 80 ? (
          <p className="hd-alert hd-alert--warning" role="status">
            Storage is almost full. Download a backup, then delete drafts you no longer need.
          </p>
        ) : null}
        <p>
          <strong>Persistent storage:</strong>{' '}
          {storage.persisted === undefined
            ? 'unknown'
            : storage.persisted
              ? 'granted (the browser will not clear your drafts to free space)'
              : 'not granted (the browser may clear drafts if the device runs low on space)'}
        </p>
        <p className="hd-help">
          Clearing site data, using private windows or switching browsers removes drafts. Download a
          backup regularly to keep a copy and to move drafts between devices.
        </p>
      </div>
      <Actions>
        {storage.persisted === false ? (
          <button
            type="button"
            className="hd-btn hd-btn--secondary"
            onClick={() => void requestPersistent()}
          >
            Request persistent storage
          </button>
        ) : null}
        <button type="button" className="hd-btn hd-btn--secondary" onClick={() => void backup()}>
          <IconDatabase width={16} height={16} /> Download backup
        </button>
        <button type="button" className="hd-btn" onClick={close}>
          Done
        </button>
      </Actions>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ confirmations */

function ConfirmDialog({
  dialog,
  close,
}: {
  dialog: Extract<DialogState, { kind: 'confirm' }>;
  close(): void;
}): ReactElement {
  return (
    <Dialog title={dialog.title} onClose={close}>
      <p>{dialog.body}</p>
      <Actions>
        <button type="button" className="hd-btn hd-btn--secondary" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className={`hd-btn ${dialog.danger ? 'hd-btn--danger' : ''}`}
          onClick={() => {
            close();
            dialog.onConfirm();
          }}
        >
          {dialog.confirmLabel}
        </button>
      </Actions>
    </Dialog>
  );
}

function SwitchTemplateDialog({
  dialog,
  close,
}: {
  dialog: Extract<DialogState, { kind: 'switch-template' }>;
  close(): void;
}): ReactElement {
  return (
    <Dialog title={`Switch to ${dialog.templateName}?`} onClose={close}>
      <p>
        This template does not show the following content. It stays in your draft (nothing is
        deleted) and reappears if you switch back.
      </p>
      <ul>
        {dialog.hidden.map((field) => (
          <li key={field}>{fieldLabel(field)}</li>
        ))}
      </ul>
      <Actions>
        <button type="button" className="hd-btn hd-btn--secondary" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="hd-btn"
          onClick={() => {
            close();
            void runtime().session.switchTemplate(dialog.templateId);
          }}
        >
          Switch template
        </button>
      </Actions>
    </Dialog>
  );
}

function AboutDialog({ close }: { close(): void }): ReactElement {
  return (
    <Dialog title="HexaData Spec Editor" onClose={close}>
      <div className="hd-stack">
        <p>
          Version {APP_VERSION} · built on the HexaData brand system (revision {BRAND_REVISION}).
        </p>
        <p className="hd-help">
          HexaData, the HexaData logo and the brand assets are trademarks and proprietary material
          of Esconet Technologies Limited. Fonts: Space Grotesk, Inter Tight and JetBrains Mono (SIL
          OFL 1.1).
        </p>
      </div>
      <Actions>
        <button type="button" className="hd-btn" onClick={close}>
          Close
        </button>
      </Actions>
    </Dialog>
  );
}

/** Renders the dialog requested through the UI store. */
export function Dialogs(): ReactElement | null {
  const dialog = useUi((state) => state.dialog);
  const seq = useUi((state) => state.dialogSeq);
  const close = useUi((state) => state.closeDialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'new-draft':
      return <NewDraftDialog key={seq} close={close} />;
    case 'trash':
      return <TrashDialog key={seq} close={close} />;
    case 'import':
      return <ImportDialog key={seq} close={close} />;
    case 'shortcuts':
      return <ShortcutsDialog key={seq} close={close} />;
    case 'storage':
      return <StorageDialog key={seq} close={close} />;
    case 'about':
      return <AboutDialog key={seq} close={close} />;
    case 'confirm':
      return <ConfirmDialog key={seq} dialog={dialog} close={close} />;
    case 'switch-template':
      return <SwitchTemplateDialog key={seq} dialog={dialog} close={close} />;
  }
}
