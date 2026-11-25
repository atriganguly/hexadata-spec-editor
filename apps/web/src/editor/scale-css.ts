/**
 * Browsers can enforce a minimum font size (an accessibility setting). The sheet's small print (6.5 to 8 pt) is then
 * drawn larger in the editor than in the PDF, wraps differently and breaks pages at other rows. CSS `zoom` does not
 * help: the browser clamps the font after it. What does help is making every length of the template really larger
 * (so even the smallest font is far above any floor) and scaling the whole sheet back down with a transform.
 * Wrapping is unchanged because every length, fonts included, grows by the same factor.
 */

/** How many times larger the sheet is laid out when the browser enforces a minimum font size. */
export const FLOORED_LAYOUT_SCALE = 4;

let cached: number | undefined;

/** `FLOORED_LAYOUT_SCALE` when this browser inflates small text, otherwise 1 (the sheet is laid out at its real size). */
export function detectLayoutScale(): number {
  if (cached !== undefined) return cached;
  const probe = document.createElement('span');
  probe.textContent = 'M';
  // CSSOM (allowed by the strict style-src): a 6 px font that a minimum font size would grow.
  probe.style.cssText =
    'position:absolute;visibility:hidden;font-family:sans-serif;font-size:6px;line-height:1;white-space:nowrap';
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  cached = height > 6.5 ? FLOORED_LAYOUT_SCALE : 1;
  return cached;
}

const LENGTH = /(?<![\w.#-])(-?\d*\.?\d+)(mm|pt|px|rem|cm|in)\b/g;
const TOKEN = /var\(\s*(--hd-(?:space|radius|font-size)[a-z0-9-]*)\s*\)/g;

/**
 * Multiplies every absolute length in a stylesheet (`mm`, `pt`, `px`, `rem`, `cm`, `in`, also inside `calc()` and
 * `clip-path`) and the brand's length tokens (`var(--hd-space-2)`, ...) by `scale`. Unitless numbers, percentages and
 * `em` are left alone: they are relative to values that were already scaled.
 */
export function scaleCss(css: string, scale: number): string {
  if (scale === 1) return css;
  return css
    .replace(LENGTH, (_match, value: string, unit: string) => {
      const scaled = Math.round(parseFloat(value) * scale * 10_000) / 10_000;
      return `${scaled}${unit}`;
    })
    .replace(TOKEN, (_match, name: string) => `calc(var(${name}) * ${scale})`);
}
