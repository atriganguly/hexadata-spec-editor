import { describe, expect, it } from 'vitest';
import { scaleCss } from '../src/editor/scale-css.ts';

describe('scaleCss', () => {
  it('leaves the CSS untouched at scale 1', () => {
    const css = '.a { width: 210mm; font-size: 8pt; }';
    expect(scaleCss(css, 1)).toBe(css);
  });

  it('multiplies absolute lengths, also inside calc() and clip-path', () => {
    const css = `.a{width:210mm;font-size:7.2pt;border:1px solid;margin:-2mm 0 .5px 1.5mm;
      height:calc(var(--hd-pages, 1) * 297mm);
      clip-path:polygon(0 0, calc(100% - 4mm) 0, 100% 100%, 0 100%);
      top:calc(40.5mm * 87 / 500);padding:0.125rem}`;
    const out = scaleCss(css, 4);
    expect(out).toContain('width:840mm');
    expect(out).toContain('font-size:28.8pt');
    expect(out).toContain('border:4px solid');
    expect(out).toContain('margin:-8mm 0 2px 6mm');
    expect(out).toContain('calc(var(--hd-pages, 1) * 1188mm)');
    expect(out).toContain('calc(100% - 16mm)');
    expect(out).toContain('calc(162mm * 87 / 500)');
    expect(out).toContain('padding:0.5rem');
  });

  it('leaves unitless numbers, percentages and em alone', () => {
    const out = scaleCss('.a{line-height:1.35;width:50%;margin:2em;font-weight:700;opacity:.5}', 4);
    expect(out).toBe('.a{line-height:1.35;width:50%;margin:2em;font-weight:700;opacity:.5}');
  });

  it('scales the brand length tokens', () => {
    const out = scaleCss(
      '.t{padding:0.125rem var(--hd-space-2);border-radius:var(--hd-radius-sm);font-size:var(--hd-font-size-xs);color:var(--hd-white)}',
      4,
    );
    expect(out).toContain('padding:0.5rem calc(var(--hd-space-2) * 4)');
    expect(out).toContain('border-radius:calc(var(--hd-radius-sm) * 4)');
    expect(out).toContain('font-size:calc(var(--hd-font-size-xs) * 4)');
    expect(out).toContain('color:var(--hd-white)');
  });

  it('does not match units inside identifiers or colours', () => {
    const out = scaleCss('.cs-1px-x{color:#12ab3c;--x:2mmx}', 4);
    expect(out).toBe('.cs-1px-x{color:#12ab3c;--x:2mmx}');
  });
});
