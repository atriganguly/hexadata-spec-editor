import type { CSSProperties, ReactElement } from 'react';
import {
  BrandLogo,
  Features,
  PartnerLogos,
  Pages,
  ProductImage,
  SpecTable,
  Text,
  TextCopy,
  usePageCount,
  usePageNumbers,
} from '../slots.tsx';

/** Slanted section tab. Module-level so it never remounts. */
function Tab({ title, chrome }: { title: string; chrome?: boolean }): ReactElement {
  return (
    <div className={chrome ? 'cs-tab-row cs-tab-row--chrome' : 'cs-tab-row'}>
      <div className="cs-tab">{title}</div>
      <div className="cs-tab-line" />
    </div>
  );
}

const pad = (n: number): string => String(n).padStart(2, '0');

const tableProps = {
  className: 'cs-table',
  labelClassName: 'cs-td-label',
  emphasisClassName: 'cs-td-emphasis',
} as const;

/**
 * The original HexaData specification sheet.
 *
 * The header, title block, image, features and the specification tables are ONE continuous flow. When the tables
 * grow past the page, rows move to the next page (see `paginate`) and the sheet becomes `pages x 297 mm` tall.
 * Everything that belongs to a page rather than to the flow is drawn by `Pages`, once per page: the continuation
 * header on pages 2+, the bottom bar on every page, the page number tag on every page but the last, the full footer (text and logo) on the last page.
 * `data-hd-flow` marks the flowing tables and `data-hd-fixed` the page chrome the rows must stay above.
 */
export function Classic(): ReactElement {
  const pages = usePageCount();
  const numbers = usePageNumbers();
  return (
    <div
      className="cs-sheet"
      data-template="classic"
      style={{ ['--hd-pages' as string]: pages } as CSSProperties}
    >
      <div className="cs-header">
        <Text field="meta.headerTitle" className="cs-header-title" />
      </div>

      <div className="cs-inner">
        <div className="cs-title-row">
          <div className="cs-title-block">
            <Text field="meta.title" className="cs-title" />
            <Text field="meta.subtitle" className="cs-subtitle" />
          </div>
          <PartnerLogos className="cs-logos" logoClassName="cs-logo" />
        </div>

        <div className="cs-middle">
          <div className="cs-product">
            <ProductImage className="cs-product-img" />
          </div>
          <div className="cs-side">
            <Tab title="Key Features" />
            <Features className="cs-list" itemClassName="cs-list-item" />
            <Tab title="Applications" />
            <Text field="applications" className="cs-app" />
          </div>
        </div>

        <div>
          <Tab title="Specification" />
          <div className="cs-spec-cols">
            <div className="cs-spec-col" data-hd-flow="">
              <SpecTable column={0} {...tableProps} />
            </div>
            <div className="cs-spec-col" data-hd-flow="">
              <SpecTable column={1} {...tableProps} />
            </div>
          </div>
        </div>
      </div>

      <Pages heightMm={297}>
        {({ index, count, last }) => (
          <>
            {index > 0 ? (
              <>
                <div className="cs-header cs-header--chrome">
                  <TextCopy field="meta.headerTitle" className="cs-header-title" />
                </div>
                <Tab title="Specification (continued)" chrome />
              </>
            ) : null}
            {last ? (
              // The full footer (link, disclaimer, copyright, logo) belongs to the last page only.
              <div className="cs-footer">
                <div className="cs-footer-text" data-hd-fixed="footer">
                  <Text field="footer.url" className="cs-footer-url" />
                  <Text field="footer.disclaimer" className="cs-footer-disclaimer" />
                  <Text field="footer.copyright" />
                </div>
                <div className="cs-mark">
                  <BrandLogo name="centered-primary-on-light" className="cs-mark-img" fixed />
                </div>
              </div>
            ) : numbers ? (
              // Every other page: just a page number tag (the brand's accent badge), e.g. "Page 01/04".
              <div className="cs-page-tag" data-hd-fixed="tag">
                {`Page ${pad(index + 1)}/${pad(count)}`}
              </div>
            ) : null}
            <div className="cs-bottom-bar" />
          </>
        )}
      </Pages>
    </div>
  );
}
