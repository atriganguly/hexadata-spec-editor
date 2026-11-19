import type { ReactElement } from 'react';
import { BrandLogo, Features, PartnerLogos, ProductImage, SpecTable, Text } from '../slots.tsx';

/** Slanted section tab. Module-level so it never remounts. */
function Tab({ title }: { title: string }): ReactElement {
  return (
    <div className="cs-tab-row">
      <div className="cs-tab">{title}</div>
      <div className="cs-tab-line" />
    </div>
  );
}

const tableProps = {
  className: 'cs-table',
  labelClassName: 'cs-td-label',
  emphasisClassName: 'cs-td-emphasis',
} as const;

/**
 * The original HexaData specification sheet.
 * `data-hd-flow` marks flowing content and `data-hd-fixed` marks absolutely positioned content; the editor
 * uses them to warn when the two collide (overflow).
 */
export function Classic(): ReactElement {
  return (
    <div className="cs-sheet" data-template="classic">
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

      <div className="cs-footer">
        <div className="cs-footer-text" data-hd-fixed="">
          <Text field="footer.url" className="cs-footer-url" />
          <Text field="footer.disclaimer" className="cs-footer-disclaimer" />
          <Text field="footer.copyright" />
        </div>
        <div className="cs-mark">
          <BrandLogo name="centered-primary-on-light" className="cs-mark-img" fixed />
        </div>
      </div>
      <div className="cs-bottom-bar" />
    </div>
  );
}
