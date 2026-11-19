// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { plainText, rt } from '@hexadata/spec-core';
import { richTextToHtml } from '@hexadata/spec-templates';
import { domToRichText, htmlToRichText } from '../src/lib/richtext-dom.ts';

const fromHtml = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return domToRichText(el);
};

describe('domToRichText', () => {
  it('reads tags for bold, italic and underline', () => {
    expect(fromHtml('a <b>b</b><i>c</i><u>d</u><strong>e</strong><em>f</em>')).toEqual([
      [
        { t: 'a ' },
        { t: 'b', b: true },
        { t: 'c', i: true },
        { t: 'd', u: true },
        { t: 'e', b: true },
        { t: 'f', i: true },
      ],
    ]);
  });

  it('round-trips with the HTML the editor renders', () => {
    const samples = [
      rt(''),
      rt('plain'),
      rt('a\n\nb'),
      [
        [
          { t: 'x', b: true as const },
          { t: 'y', i: true as const, u: true as const },
        ],
      ],
      [[{ t: '<script>alert(1)</script> & "q"' }]],
    ];
    for (const value of samples) {
      expect(fromHtml(richTextToHtml(value))).toEqual(value);
    }
  });

  it('turns <br> and block elements into lines', () => {
    expect(plainText(fromHtml('a<br>b'))).toBe('a\nb');
    expect(plainText(fromHtml('<div>a</div><div>b</div>'))).toBe('a\nb');
    expect(plainText(fromHtml('<div>a</div><div><br></div><div>b</div>'))).toBe('a\n\nb');
    expect(plainText(fromHtml('<p>a</p><p>b</p>'))).toBe('a\nb');
  });

  it('drops the browser placeholder <br> of an empty field', () => {
    expect(fromHtml('<br>')).toEqual([]);
    expect(fromHtml('')).toEqual([]);
    expect(fromHtml('a<br>')).toEqual([[{ t: 'a' }]]);
  });

  it('understands inline styles used by Word and Google Docs', () => {
    expect(fromHtml('<span style="font-weight:700">b</span>')).toEqual([[{ t: 'b', b: true }]]);
    expect(fromHtml('<span style="font-weight: bold">b</span>')).toEqual([[{ t: 'b', b: true }]]);
    expect(fromHtml('<span style="font-style:italic">i</span>')).toEqual([[{ t: 'i', i: true }]]);
    expect(fromHtml('<span style="text-decoration:underline">u</span>')).toEqual([
      [{ t: 'u', u: true }],
    ]);
    // Google Docs wraps everything in a non-bold <b>
    expect(fromHtml('<b style="font-weight:normal"><span>plain</span></b>')).toEqual([
      [{ t: 'plain' }],
    ]);
    expect(
      fromHtml('<b style="font-weight:normal"><span style="font-weight:700">bold</span></b>'),
    ).toEqual([[{ t: 'bold', b: true }]]);
  });

  it('strips everything else: fonts, colours, links, scripts, styles, attributes', () => {
    const out = fromHtml(
      '<span style="color:red;font-family:Comic Sans MS" class="x" onclick="evil()">safe</span>' +
        '<a href="javascript:alert(1)">link</a><script>alert(1)</script><style>p{}</style>' +
        '<img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe>',
    );
    expect(plainText(out)).toBe('safelink');
    expect(JSON.stringify(out)).not.toMatch(/color|href|class|onclick|script/);
  });

  it('normalises non-breaking and zero-width characters', () => {
    expect(plainText(fromHtml('a&nbsp;b​c'))).toBe('a bc');
  });

  it('turns newline characters into lines (pre-wrap text nodes)', () => {
    expect(plainText(fromHtml('a\nb'))).toBe('a\nb');
  });
});

describe('htmlToRichText (clipboard)', () => {
  it('parses a full clipboard document without running anything', () => {
    const html =
      '<html><head><meta charset="utf-8"><title>t</title><script>window.__x=1</script></head><body>' +
      '<!--StartFragment--><p>Hello <b>world</b></p><p>second</p><!--EndFragment--></body></html>';
    const out = htmlToRichText(html);
    expect(plainText(out)).toBe('Hello world\nsecond');
    expect(out[0]).toEqual([{ t: 'Hello ' }, { t: 'world', b: true }]);
    expect((window as unknown as { __x?: number }).__x).toBeUndefined();
  });
});
