import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { RichText, SpecSheetContent } from '@hexadata/spec-core';
import { pageNumbersShown } from './fields.ts';
import { renderRichText } from './rich-text.tsx';
import type { BrandLogoName, SheetValue, TextAddress, TextCellProps, TextField } from './types.ts';

/**
 * Slots are the only way a template places content. They read the sheet from context, so the SAME
 * template component renders the editor (mode "edit") and the PDF (mode "print"). They are
 * module-level components (stable identity), so React never remounts them while typing.
 *
 * Edit mode only adds `data-edit-*` attributes and swaps the text cell for an editable one: the box
 * model is identical in both modes, which keeps the editor and the PDF matching by construction.
 */
const SheetContext = createContext<SheetValue | null>(null);

export function SheetProvider({
  value,
  children,
}: {
  value: SheetValue;
  children: ReactNode;
}): ReactElement {
  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}

export function useSheet(): SheetValue {
  const value = useContext(SheetContext);
  if (!value) throw new Error('Template slots must render inside <SheetProvider>.');
  return value;
}

function cx(...parts: Array<string | false | undefined | null>): string | undefined {
  const joined = parts.filter(Boolean).join(' ');
  return joined === '' ? undefined : joined;
}

export function getTextField(content: SpecSheetContent, field: TextField): RichText {
  switch (field) {
    case 'meta.headerTitle':
      return content.meta.headerTitle;
    case 'meta.title':
      return content.meta.title;
    case 'meta.subtitle':
      return content.meta.subtitle;
    case 'applications':
      return content.applications;
    case 'footer.url':
      return content.footer.url;
    case 'footer.disclaimer':
      return content.footer.disclaimer;
    case 'footer.copyright':
      return content.footer.copyright;
  }
}

/** Default (print) rich-text cell: static, escaped by React. */
export function StaticTextCell({ value, className }: TextCellProps): ReactElement {
  return <div className={cx('rt', className)}>{renderRichText(value)}</div>;
}

/** Whether page numbers are drawn (the sheet setting; see `pageNumbersShown`). */
export function usePageNumbers(): boolean {
  return pageNumbersShown(useSheet().content);
}

/** Number of pages the sheet currently spans (1 until the layout has been measured). */
export function usePageCount(): number {
  return useSheet().pagination?.pages ?? 1;
}

/**
 * Page chrome: renders `children` once per page, absolutely positioned over that page of the continuous sheet
 * (header of continuation pages, logo, footer...). The flowing content is never split or moved by it; only the
 * spacers inside the specification tables push rows onto the next page.
 */
export function Pages({
  heightMm,
  children,
}: {
  heightMm: number;
  children(page: { index: number; count: number; first: boolean; last: boolean }): ReactNode;
}): ReactElement {
  const pages = usePageCount();
  const { layoutScale = 1 } = useSheet();
  return (
    <>
      {Array.from({ length: pages }, (_, index) => (
        <div
          key={index}
          className="hd-page"
          data-hd-page={index}
          style={{
            top: `${index * heightMm * layoutScale}mm`,
            height: `${heightMm * layoutScale}mm`,
          }}
        >
          {children({ index, count: pages, first: index === 0, last: index === pages - 1 })}
        </div>
      ))}
    </>
  );
}

/** Read-only copy of a text field (for repeated page chrome). Editing happens at the field's one editable place. */
export function TextCopy({
  field,
  className,
}: {
  field: TextField;
  className?: string;
}): ReactElement {
  const { content } = useSheet();
  return (
    <StaticTextCell
      address={{ kind: 'field', field }}
      value={getTextField(content, field)}
      className={className}
    />
  );
}

/* ---------- Text ---------- */

export function Text({ field, className }: { field: TextField; className?: string }): ReactElement {
  const { content, TextCell: Cell = StaticTextCell } = useSheet();
  const address: TextAddress = { kind: 'field', field };
  return <Cell address={address} value={getTextField(content, field)} className={className} />;
}

/* ---------- Key features ---------- */

export function Features({
  className,
  itemClassName,
}: {
  className?: string;
  itemClassName?: string;
}): ReactElement {
  const { content, mode, TextCell: Cell = StaticTextCell } = useSheet();
  const edit = mode === 'edit';
  return (
    <ul className={className} data-edit-list={edit ? 'features' : undefined}>
      {content.keyFeatures.map((feature) => (
        <li
          key={feature.id}
          className={itemClassName}
          data-edit-item={edit ? 'feature' : undefined}
          data-id={edit ? feature.id : undefined}
        >
          <Cell address={{ kind: 'feature', id: feature.id }} value={feature.text} />
        </li>
      ))}
    </ul>
  );
}

/* ---------- Specification table ---------- */

export interface SpecTableProps {
  column: 0 | 1;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  /** Added to the value cell of rows with `emphasis`. */
  emphasisClassName?: string;
}

export function SpecTable({
  column,
  className,
  labelClassName,
  valueClassName,
  emphasisClassName,
}: SpecTableProps): ReactElement {
  const {
    content,
    mode,
    pagination,
    layoutScale = 1,
    TextCell: Cell = StaticTextCell,
  } = useSheet();
  const edit = mode === 'edit';
  return (
    <table
      className={className}
      data-edit-list={edit ? 'rows' : undefined}
      data-column={edit ? column : undefined}
    >
      <tbody>
        {content.specColumns[column].flatMap((row) => [
          // Page break: an empty row that pushes the next row onto the next page. Rows themselves never move in the
          // DOM, so editing (caret, focus) is undisturbed when a row crosses a page boundary.
          ...(pagination?.spacers[row.id]
            ? [
                <tr key={`gap-${row.id}`} className="hd-page-gap" aria-hidden="true" data-hd-gap="">
                  <td
                    colSpan={2}
                    style={{ height: `${(pagination.spacers[row.id] ?? 0) * layoutScale}px` }}
                  />
                </tr>,
              ]
            : []),
          <tr
            key={row.id}
            data-hd-row={row.id}
            data-hd-col={column}
            data-edit-item={edit ? 'row' : undefined}
            data-column={edit ? column : undefined}
            data-id={edit ? row.id : undefined}
          >
            <td className={labelClassName}>
              <Cell
                address={{ kind: 'row', column, id: row.id, part: 'label' }}
                value={row.label}
              />
            </td>
            <td className={cx(valueClassName, row.emphasis && emphasisClassName)}>
              <Cell
                address={{ kind: 'row', column, id: row.id, part: 'value' }}
                value={row.value}
              />
            </td>
          </tr>,
        ])}
      </tbody>
    </table>
  );
}

/* ---------- Images ---------- */

export function ProductImage({ className }: { className?: string }): ReactElement | null {
  const { content, mode, urls } = useSheet();
  const src = content.productImage ? urls.asset(content.productImage) : undefined;
  const edit = mode === 'edit';
  if (!src && !edit) return null;
  // Editor: render the element even when empty so the slot box (and its click target) exists.
  return (
    <img
      className={className}
      src={src}
      alt={src ? 'Product' : ''}
      data-edit-image={edit ? 'product' : undefined}
      data-empty={edit && !src ? '' : undefined}
      decoding="async"
    />
  );
}

export function PartnerLogos({
  className,
  logoClassName,
}: {
  className?: string;
  logoClassName?: string;
}): ReactElement {
  const { content, mode, urls } = useSheet();
  const edit = mode === 'edit';
  return (
    <div className={className} data-edit-list={edit ? 'logos' : undefined}>
      {content.partnerLogos.map((logo, index) => {
        const src = urls.asset(logo.ref);
        if (!src && !edit) return null;
        return (
          <img
            key={logo.id}
            className={logoClassName}
            src={src}
            alt={`Partner logo ${index + 1}`}
            data-edit-item={edit ? 'logo' : undefined}
            data-id={edit ? logo.id : undefined}
            decoding="async"
          />
        );
      })}
    </div>
  );
}

/**
 * The locked official HexaData mark. Never editable: the logo rules forbid altering it.
 * `fixed` tags it as page chrome (`data-hd-fixed="mark"`): the layout measurement keeps flowing rows above it.
 */
export function BrandLogo({
  name,
  className,
  style,
  fixed,
}: {
  name: BrandLogoName;
  className?: string;
  style?: CSSProperties;
  fixed?: boolean;
}): ReactElement {
  const { urls } = useSheet();
  return (
    <img
      className={className}
      style={style}
      src={urls.brandLogo(name)}
      alt="HexaData"
      decoding="async"
      data-hd-fixed={fixed ? 'mark' : undefined}
    />
  );
}
