import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { LIMITS } from '@hexadata/spec-core';
import { getTemplateMeta } from '@hexadata/spec-templates';
import { useSession } from '../drafts/session.ts';
import { runFormat } from '../editor/FormatToolbar.tsx';
import { chooseAndApplyImage } from '../editor/imageActions.ts';
import { useDoc } from '../store/doc.ts';
import { useUi } from '../store/ui.ts';
import {
  IconAlert,
  IconBold,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClearFormat,
  IconCopy,
  IconImage,
  IconItalic,
  IconPanelRight,
  IconTrash,
  IconUnderline,
} from '../ui/icons.tsx';

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function useCellFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const update = () =>
      setFocused(
        document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable,
      );
    const afterBlur = () => setTimeout(update, 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', afterBlur);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', afterBlur);
    };
  }, []);
  return focused;
}

function Btn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactElement;
  label: string;
  onClick(): void;
  disabled?: boolean;
  danger?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      className={`hd-btn hd-btn--sm ${danger ? 'hd-btn--danger' : 'hd-btn--secondary'}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  );
}

function SelectionSection(): ReactElement {
  const selection = useUi((state) => state.selection);
  const content = useDoc((state) => state.content);
  const readOnly = useSession((state) => state.readOnly);
  const doc = useDoc.getState;
  const select = useUi((state) => state.select);

  if (!selection) {
    return (
      <p className="hd-help" style={{ margin: 0 }}>
        Click a feature, a table row or an image on the sheet to see its options here.
      </p>
    );
  }

  if (selection.kind === 'feature') {
    const index = content.keyFeatures.findIndex((f) => f.id === selection.id);
    if (index === -1) return <p className="hd-help">This item no longer exists.</p>;
    return (
      <div className="hd-stack" style={{ ['--hd-stack-gap' as string]: '0.75rem' }}>
        <p className="hd-help" style={{ margin: 0 }}>
          Key feature {index + 1} of {content.keyFeatures.length}
        </p>
        <div className="btn-row">
          <Btn
            icon={<IconChevronUp width={16} height={16} />}
            label="Move up"
            disabled={readOnly || index === 0}
            onClick={() => doc().moveFeature(selection.id, -1)}
          />
          <Btn
            icon={<IconChevronDown width={16} height={16} />}
            label="Move down"
            disabled={readOnly || index === content.keyFeatures.length - 1}
            onClick={() => doc().moveFeature(selection.id, 1)}
          />
          <Btn
            icon={<IconCopy width={16} height={16} />}
            label="Duplicate"
            disabled={readOnly || content.keyFeatures.length >= LIMITS.keyFeatures}
            onClick={() => doc().duplicateFeature(selection.id)}
          />
          <Btn
            icon={<IconTrash width={16} height={16} />}
            label="Remove"
            danger
            disabled={readOnly}
            onClick={() => {
              doc().removeFeature(selection.id);
              select(null);
            }}
          />
        </div>
      </div>
    );
  }

  if (selection.kind === 'row') {
    const rows = content.specColumns[selection.column];
    const index = rows.findIndex((r) => r.id === selection.id);
    const row = rows[index];
    if (!row) return <p className="hd-help">This row no longer exists.</p>;
    return (
      <div className="hd-stack" style={{ ['--hd-stack-gap' as string]: '0.75rem' }}>
        <p className="hd-help" style={{ margin: 0 }}>
          {selection.column === 0 ? 'Left' : 'Right'} table, row {index + 1} of {rows.length}
        </p>
        <label className="hd-choice">
          <input
            type="checkbox"
            role="switch"
            className="hd-switch"
            checked={row.emphasis}
            disabled={readOnly}
            onChange={(event) =>
              doc().setRowEmphasis(selection.column, selection.id, event.target.checked)
            }
          />
          <span>Highlight value</span>
        </label>
        <div className="btn-row">
          <Btn
            icon={<IconChevronUp width={16} height={16} />}
            label="Move up"
            disabled={readOnly || index === 0}
            onClick={() => doc().moveRow(selection.column, selection.id, -1)}
          />
          <Btn
            icon={<IconChevronDown width={16} height={16} />}
            label="Move down"
            disabled={readOnly || index === rows.length - 1}
            onClick={() => doc().moveRow(selection.column, selection.id, 1)}
          />
          <Btn
            icon={<IconCopy width={16} height={16} />}
            label="Duplicate"
            disabled={readOnly || rows.length >= LIMITS.rowsPerColumn}
            onClick={() => doc().duplicateRow(selection.column, selection.id)}
          />
          <Btn
            icon={<IconTrash width={16} height={16} />}
            label="Remove"
            danger
            disabled={readOnly}
            onClick={() => {
              doc().removeRow(selection.column, selection.id);
              select(null);
            }}
          />
        </div>
      </div>
    );
  }

  if (selection.kind === 'logo') {
    return (
      <div className="hd-stack" style={{ ['--hd-stack-gap' as string]: '0.75rem' }}>
        <p className="hd-help" style={{ margin: 0 }}>
          Partner logo ({content.partnerLogos.length} of {LIMITS.partnerLogos})
        </p>
        <div className="btn-row">
          <Btn
            icon={<IconImage width={16} height={16} />}
            label="Replace image"
            disabled={readOnly}
            onClick={() => void chooseAndApplyImage({ kind: 'logo', id: selection.id })}
          />
          <Btn
            icon={<IconTrash width={16} height={16} />}
            label="Remove"
            danger
            disabled={readOnly}
            onClick={() => {
              doc().removePartnerLogo(selection.id);
              select(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="hd-stack" style={{ ['--hd-stack-gap' as string]: '0.75rem' }}>
      <p className="hd-help" style={{ margin: 0 }}>
        Product image. Click it on the sheet, or drop a PNG, JPEG or WebP file onto it.
      </p>
      <div className="btn-row">
        <Btn
          icon={<IconImage width={16} height={16} />}
          label="Replace image"
          disabled={readOnly}
          onClick={() => void chooseAndApplyImage({ kind: 'product' })}
        />
        <Btn
          icon={<IconTrash width={16} height={16} />}
          label="Remove"
          danger
          disabled={readOnly || !content.productImage}
          onClick={() => doc().setProductImage(null)}
        />
      </div>
    </div>
  );
}

/** Context panel: options for the selected item, text formatting, layout checks and template info. */
export function Inspector(): ReactElement {
  const issues = useUi((state) => state.issues);
  const setInspectorOpen = useUi((state) => state.setInspectorOpen);
  const templateId = useDoc((state) => state.templateId);
  const templateVersion = useDoc((state) => state.templateVersion);
  const content = useDoc((state) => state.content);
  const readOnly = useSession((state) => state.readOnly);
  const cellFocused = useCellFocused();
  const meta = templateId ? getTemplateMeta(templateId, templateVersion) : undefined;

  return (
    <aside className="panel panel--inspector" aria-label="Inspector">
      <div className="panel__head">
        <h2 className="panel__title">Inspector</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close inspector"
          onClick={() => setInspectorOpen(false)}
        >
          <IconPanelRight />
        </button>
      </div>
      <div className="panel__body">
        <Section title="Selection">
          <SelectionSection />
        </Section>

        <Section title="Text">
          <div className="btn-row" role="group" aria-label="Text formatting">
            {[
              { command: 'bold', label: 'Bold', icon: <IconBold /> },
              { command: 'italic', label: 'Italic', icon: <IconItalic /> },
              { command: 'underline', label: 'Underline', icon: <IconUnderline /> },
              { command: 'removeFormat', label: 'Clear formatting', icon: <IconClearFormat /> },
            ].map(({ command, label, icon }) => (
              <button
                key={command}
                type="button"
                className="icon-btn icon-btn--lg"
                aria-label={label}
                title={label}
                disabled={readOnly || !cellFocused}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  runFormat(command as 'bold' | 'italic' | 'underline' | 'removeFormat')
                }
              >
                {icon}
              </button>
            ))}
          </div>
          <p className="hd-help" style={{ margin: 0 }}>
            {cellFocused
              ? 'Select text, then choose a style.'
              : 'Click into any text on the sheet to format it.'}
          </p>
        </Section>

        <Section title="Sheet checks">
          {issues.length === 0 ? (
            <p className="issue" style={{ borderColor: 'var(--hd-border-subtle)' }} role="status">
              <IconCheck />
              <span>Everything fits on the page.</span>
            </p>
          ) : (
            <div
              className="hd-stack"
              style={{ ['--hd-stack-gap' as string]: '0.5rem' }}
              role="status"
            >
              {issues.map((issue) => (
                <p key={issue.id} className="issue">
                  <IconAlert />
                  <span>{issue.message}</span>
                </p>
              ))}
              <p className="hd-help" style={{ margin: 0 }}>
                Shorten the highlighted content or remove a row. Overflowing content is clipped in
                the PDF.
              </p>
            </div>
          )}
        </Section>

        <Section title="At a glance">
          <dl
            className="hd-text-detail"
            style={{
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.25rem 0.75rem',
            }}
          >
            <dt>Features</dt>
            <dd style={{ margin: 0 }}>
              {content.keyFeatures.length} / {LIMITS.keyFeatures}
            </dd>
            <dt>Left rows</dt>
            <dd style={{ margin: 0 }}>
              {content.specColumns[0].length} / {LIMITS.rowsPerColumn}
            </dd>
            <dt>Right rows</dt>
            <dd style={{ margin: 0 }}>
              {content.specColumns[1].length} / {LIMITS.rowsPerColumn}
            </dd>
            <dt>Logos</dt>
            <dd style={{ margin: 0 }}>
              {content.partnerLogos.length} / {LIMITS.partnerLogos}
            </dd>
          </dl>
        </Section>

        {meta ? (
          <Section title="Template">
            <div className="hd-stack" style={{ ['--hd-stack-gap' as string]: '0.25rem' }}>
              <strong>{meta.name}</strong>
              <span className="hd-help">{meta.description}</span>
              <span className="hd-help">
                A4 · {meta.page.widthMm} × {meta.page.heightMm} mm
              </span>
            </div>
          </Section>
        ) : null}
      </div>
    </aside>
  );
}
