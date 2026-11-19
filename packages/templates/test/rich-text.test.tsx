import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RichText } from '@hexadata/spec-core';
import { escapeHtml, renderRichText, richTextToHtml } from '../src/index.ts';

const react = (value: RichText) =>
  renderToStaticMarkup(<>{renderRichText(value)}</>).replaceAll('<br/>', '<br>');

const samples: Record<string, RichText> = {
  empty: [],
  plain: [[{ t: 'hello' }]],
  lines: [[{ t: 'a' }], [], [{ t: 'b' }]],
  marks: [
    [
      { t: 'x', b: true },
      { t: 'y', i: true },
      { t: 'z', u: true },
      { t: 'w', b: true, i: true, u: true },
    ],
  ],
  hostile: [[{ t: '<script>alert(1)</script>' }], [{ t: '"quoted" & <b>not bold</b>', b: true }]],
};

describe('rich text renderers', () => {
  it.each(Object.entries(samples))('React and HTML-string renderers agree: %s', (_name, value) => {
    expect(react(value)).toBe(richTextToHtml(value));
  });

  it('renders empty fields as a single <br> so empty cells keep a line of height', () => {
    expect(richTextToHtml([])).toBe('<br>');
    expect(react([])).toBe('<br>');
  });

  it('nests marks as <b><i><u>', () => {
    expect(richTextToHtml([[{ t: 'x', b: true, i: true, u: true }]])).toBe(
      '<b><i><u>x</u></i></b>',
    );
  });

  it('escapes markup characters, so text can never become elements', () => {
    const html = richTextToHtml(samples.hostile!);
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; &lt;b&gt;not bold&lt;/b&gt;');
    expect(escapeHtml(`<>&"`)).toBe('&lt;&gt;&amp;&quot;');
  });
});
