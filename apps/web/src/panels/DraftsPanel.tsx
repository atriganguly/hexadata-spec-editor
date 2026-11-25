import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { LIMITS } from '@hexadata/spec-core';
import { getTemplateMeta } from '@hexadata/spec-templates';
import { runtime } from '../app/runtime.ts';
import { useSession } from '../drafts/session.ts';
import type { DraftMeta } from '../drafts/types.ts';
import { formatBytes, timeAgo } from '../lib/format.ts';
import { useUi } from '../store/ui.ts';
import { Menu, type MenuEntry } from '../ui/Menu.tsx';
import {
  IconCopy,
  IconDownload,
  IconFilePlus,
  IconMore,
  IconPencil,
  IconPanelLeft,
  IconSearch,
  IconTrash,
  IconUpload,
} from '../ui/icons.tsx';
import { downloadBlob } from '../export/export-pdf.ts';

const ITEM_HEIGHT = 92; // card + gap, in px (fixed so long lists can be windowed)
const WINDOW_THRESHOLD = 100;

type Sort = 'recent' | 'name';

function DraftCard({
  meta,
  current,
  renaming,
  onStartRename,
  onStopRename,
}: {
  meta: DraftMeta;
  current: boolean;
  renaming: boolean;
  onStartRename(): void;
  onStopRename(): void;
}): ReactElement {
  const { session } = runtime();
  const templateName =
    getTemplateMeta(meta.templateId, meta.templateVersion)?.name ?? meta.templateId;
  const [value, setValue] = useState(meta.name);

  const commit = () => {
    const next = value.trim();
    onStopRename();
    if (next && next !== meta.name) void session.rename(meta.id, next);
  };

  const entries: MenuEntry[] = [
    { label: 'Rename', icon: <IconPencil />, onSelect: onStartRename },
    { label: 'Duplicate', icon: <IconCopy />, onSelect: () => void session.duplicate(meta.id) },
    {
      label: 'Download draft file',
      icon: <IconDownload />,
      onSelect: async () => {
        const file = await session.exportDraftById(meta.id);
        if (file)
          downloadBlob(
            new Blob([file.bytes as BlobPart], { type: 'application/zip' }),
            file.fileName,
          );
      },
    },
    {
      label: 'Move to trash',
      icon: <IconTrash />,
      separator: true,
      onSelect: () => void session.trashDraft(meta.id),
    },
  ];

  const body = (
    <>
      {renaming ? (
        <input
          className="hd-input"
          aria-label="Draft name"
          value={value}
          maxLength={LIMITS.draftName}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') onStopRename();
          }}
        />
      ) : (
        <span className="draft-card__name">{meta.name}</span>
      )}
      <span className="draft-card__title">{meta.title || 'Untitled sheet'}</span>
      <span className="draft-card__meta">
        <span className="hd-badge">{templateName}</span>
        <span>{current ? 'Open now' : timeAgo(meta.updatedAt)}</span>
      </span>
    </>
  );

  return (
    <div style={{ position: 'relative', blockSize: ITEM_HEIGHT - 8 }}>
      {renaming ? (
        <div className="draft-card" aria-current={current}>
          {body}
        </div>
      ) : (
        <button
          type="button"
          className="draft-card"
          aria-current={current}
          onClick={() => void session.open(meta.id)}
        >
          {body}
        </button>
      )}
      {renaming ? null : (
        <div className="draft-card__menu">
          <Menu label={`Actions for ${meta.name}`} trigger={<IconMore />} entries={entries} />
        </div>
      )}
    </div>
  );
}

/** Renders only the visible slice of a long list (every item has the same height). */
function WindowedList({
  items,
  render,
}: {
  items: DraftMeta[];
  render(item: DraftMeta): ReactElement;
}): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scroll: 0, height: 600 });
  const windowed = items.length > WINDOW_THRESHOLD;

  useEffect(() => {
    if (!windowed) return;
    const scroller = host.current?.closest<HTMLElement>('.panel__body');
    if (!scroller) return;
    const update = () =>
      setView({
        scroll: Math.max(0, scroller.scrollTop - (host.current?.offsetTop ?? 0)),
        height: scroller.clientHeight,
      });
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [windowed]);

  if (!windowed) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((item) => (
          <div key={item.id}>{render(item)}</div>
        ))}
      </div>
    );
  }
  const start = Math.max(0, Math.floor(view.scroll / ITEM_HEIGHT) - 4);
  const end = Math.min(items.length, Math.ceil((view.scroll + view.height) / ITEM_HEIGHT) + 4);
  return (
    <div ref={host} style={{ position: 'relative', blockSize: items.length * ITEM_HEIGHT }}>
      {items.slice(start, end).map((item, index) => (
        <div
          key={item.id}
          style={{ position: 'absolute', insetInline: 0, top: (start + index) * ITEM_HEIGHT }}
        >
          {render(item)}
        </div>
      ))}
    </div>
  );
}

export function DraftsPanel(): ReactElement {
  const drafts = useSession((state) => state.drafts);
  const trashCount = useSession((state) => state.trash.length);
  const currentId = useSession((state) => state.currentId);
  const storage = useSession((state) => state.storage);
  const readOnly = useSession((state) => state.readOnly);
  const setDraftsOpen = useUi((state) => state.setDraftsOpen);
  const openDialog = useUi((state) => state.openDialog);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [renamingId, setRenamingId] = useState<string>();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? drafts.filter((d) => `${d.name} ${d.title} ${d.templateId}`.toLowerCase().includes(needle))
      : drafts;
    return sort === 'name'
      ? [...filtered].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
        )
      : filtered;
  }, [drafts, query, sort]);

  const usedPct =
    storage.usage !== undefined && storage.quota
      ? Math.min(100, (storage.usage / storage.quota) * 100)
      : undefined;

  return (
    <aside className="panel panel--drafts" aria-label="Drafts">
      <div className="panel__head">
        <h2 className="panel__title">
          Drafts <span className="hd-muted">({drafts.length})</span>
        </h2>
        <div className="hd-cluster" style={{ ['--hd-cluster-gap' as string]: '0.25rem' }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Import a draft or backup"
            title="Import"
            onClick={() => openDialog({ kind: 'import' })}
          >
            <IconUpload />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="New draft"
            title="New draft (Ctrl+Alt+N)"
            onClick={() => openDialog({ kind: 'new-draft' })}
          >
            <IconFilePlus />
          </button>
          <button
            type="button"
            className="icon-btn hide-lg-up"
            aria-label="Close drafts panel"
            onClick={() => setDraftsOpen(false)}
          >
            <IconPanelLeft />
          </button>
        </div>
      </div>

      <div className="panel__body">
        <div className="hd-stack" style={{ ['--hd-stack-gap' as string]: '0.75rem' }}>
          <div className="hd-field" style={{ position: 'relative' }}>
            <label htmlFor="draft-search" className="hd-sr-only">
              Search drafts
            </label>
            <span
              style={{
                position: 'absolute',
                insetInlineStart: 10,
                insetBlockStart: 12,
                color: 'var(--hd-fg-muted)',
              }}
              aria-hidden="true"
            >
              <IconSearch width={16} height={16} />
            </span>
            <input
              id="draft-search"
              type="search"
              className="hd-input"
              style={{ paddingInlineStart: '2rem' }}
              placeholder="Search drafts"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="hd-field">
            <label htmlFor="draft-sort" className="hd-sr-only">
              Sort drafts
            </label>
            <select
              id="draft-sort"
              className="hd-select"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
            >
              <option value="recent">Recently edited</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </div>

          {visible.length === 0 ? (
            <div className="empty-state">
              <p style={{ margin: 0 }}>
                {query ? 'No drafts match your search.' : 'No drafts yet.'}
              </p>
              {!query ? (
                <button
                  type="button"
                  className="hd-btn hd-btn--secondary hd-btn--sm"
                  onClick={() => openDialog({ kind: 'new-draft' })}
                >
                  Create a draft
                </button>
              ) : null}
            </div>
          ) : (
            <WindowedList
              items={visible}
              render={(meta) => (
                <DraftCard
                  meta={meta}
                  current={meta.id === currentId}
                  renaming={renamingId === meta.id && !(readOnly && meta.id === currentId)}
                  onStartRename={() => setRenamingId(meta.id)}
                  onStopRename={() => setRenamingId(undefined)}
                />
              )}
            />
          )}
        </div>
      </div>

      <div className="panel__foot">
        <div className="hd-stack" style={{ ['--hd-stack-gap' as string]: '0.5rem' }}>
          <div className="hd-cluster" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="hd-btn hd-btn--ghost hd-btn--sm"
              onClick={() => openDialog({ kind: 'trash' })}
            >
              <IconTrash width={14} height={14} /> Trash ({trashCount})
            </button>
            <button
              type="button"
              className="hd-btn hd-btn--ghost hd-btn--sm"
              onClick={() => openDialog({ kind: 'storage' })}
            >
              Storage
            </button>
          </div>
          {usedPct !== undefined ? (
            <div>
              <div
                className="meter"
                role="img"
                aria-label={`Browser storage ${usedPct.toFixed(1)} percent used`}
                data-high={usedPct > 80}
              >
                <span style={{ inlineSize: `${Math.max(1, usedPct)}%` }} />
              </div>
              <span>
                {formatBytes(storage.usage ?? 0)} of {formatBytes(storage.quota ?? 0)} used
              </span>
            </div>
          ) : (
            <span>Drafts are saved automatically in this browser.</span>
          )}
        </div>
      </div>
    </aside>
  );
}
