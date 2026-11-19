import { describe, expect, it } from 'vitest';
import {
  charCount,
  isEmpty,
  legacyHtmlToRichText,
  normalize,
  plainText,
  richTextEquals,
  rt,
} from '../src/index.ts';

describe('rt / plainText', () => {
  it('splits on newlines and round-trips through plainText', () => {
    const value = rt('a\n\nb');
    expect(value).toEqual([[{ t: 'a' }], [], [{ t: 'b' }]]);
    expect(plainText(value)).toBe('a\n\nb');
  });

  it('treats the empty string as empty', () => {
    expect(rt('')).toEqual([]);
    expect(isEmpty(rt(''))).toBe(true);
  });

  it('counts characters without newlines', () => {
    expect(charCount(rt('ab\ncd'))).toBe(4);
  });
});

describe('normalize', () => {
  it('merges neighbouring runs with equal marks and drops empty runs', () => {
    const out = normalize([
      [{ t: 'a' }, { t: '' }, { t: 'b' }, { t: 'c', b: true }, { t: 'd', b: true }],
    ]);
    expect(out).toEqual([[{ t: 'ab' }, { t: 'cd', b: true }]]);
  });

  it('removes trailing empty lines but keeps inner ones', () => {
    expect(normalize([[{ t: 'a' }], [], [{ t: 'b' }], [], []])).toEqual([
      [{ t: 'a' }],
      [],
      [{ t: 'b' }],
    ]);
  });

  it('is idempotent and does not mutate its input', () => {
    const input = [
      [
        { t: 'x', i: true as const },
        { t: 'y', i: true as const },
      ],
    ];
    const copy = structuredClone(input);
    const once = normalize(input);
    expect(input).toEqual(copy);
    expect(normalize(once)).toEqual(once);
  });

  it('compares ignoring representation differences', () => {
    expect(richTextEquals([[{ t: 'a' }, { t: 'b' }]], [[{ t: 'ab' }]])).toBe(true);
  });
});

describe('legacyHtmlToRichText', () => {
  it('keeps bold, italic and underline', () => {
    expect(legacyHtmlToRichText('a <b>b</b> <em>c</em> <u>d</u>')).toEqual([
      [
        { t: 'a ' },
        { t: 'b', b: true },
        { t: ' ' },
        { t: 'c', i: true },
        { t: ' ' },
        { t: 'd', u: true },
      ],
    ]);
  });

  it('handles nesting', () => {
    expect(legacyHtmlToRichText('<b><i>x</i>y</b>')).toEqual([
      [
        { t: 'x', b: true, i: true },
        { t: 'y', b: true },
      ],
    ]);
  });

  it('turns <br>, blocks and newlines into lines', () => {
    expect(plainText(legacyHtmlToRichText('a<br>b'))).toBe('a\nb');
    expect(plainText(legacyHtmlToRichText('<div>a</div><div>b</div>'))).toBe('a\nb');
    expect(plainText(legacyHtmlToRichText('a\nb'))).toBe('a\nb');
    expect(plainText(legacyHtmlToRichText('<div>a</div><div><br></div><div>b</div>'))).toBe(
      'a\n\nb',
    );
  });

  it('drops a trailing browser placeholder <br>', () => {
    expect(plainText(legacyHtmlToRichText('a<br>'))).toBe('a');
  });

  it('decodes entities and never produces markup', () => {
    expect(plainText(legacyHtmlToRichText('a &amp; b &lt;c&gt; &#65; &#x42; &quot;'))).toBe(
      'a & b <c> A B "',
    );
  });

  it('strips unknown tags, scripts, styles and attributes but keeps text', () => {
    const out = legacyHtmlToRichText(
      '<span style="color:red" onclick="x()">safe</span><script>alert(1)</script><style>p{}</style><img src=x onerror=y>!',
    );
    expect(plainText(out)).toBe('safe!');
  });

  it('is lenient with broken markup', () => {
    expect(plainText(legacyHtmlToRichText('1 < 2 and <b>bold'))).toBe('1 < 2 and bold');
  });

  it('rejects invalid numeric entities', () => {
    expect(plainText(legacyHtmlToRichText('&#0;&#xD800;&#99999999;x'))).toBe('x');
  });
});
