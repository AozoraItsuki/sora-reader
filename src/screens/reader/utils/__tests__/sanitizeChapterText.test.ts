import { sanitizeChapterText } from '../sanitizeChapterText';

jest.mock('@strings/translations', () => ({
  getString: (key: string) => key,
}));

/** Every `<img src>` value the sanitizer kept, in document order. */
const imageSrcs = (html: string): string[] =>
  Array.from(html.matchAll(/<img[^>]*\ssrc=["']([^"']*)["']/g)).map(
    match => match[1],
  );

const sanitize = (img: string): string =>
  sanitizeChapterText(
    'local',
    'Novel',
    'Chapter',
    `<html><body><p>text</p>${img}</body></html>`,
  );

describe('sanitizeChapterText img sources', () => {
  it.each([
    ['a relative chapter asset', '0.b64.png'],
    ['http', 'http://example.com/a.png'],
    ['https', 'https://example.com/a.png'],
    ['file', 'file:///data/user/0/sora/files/a.png'],
    ['data', 'data:image/png;base64,AAAA'],
    ['content', 'content://com.android.externalstorage/documents/a%3A1.png'],
  ])('keeps an <img src> that is %s', (_label, src) => {
    const sanitized = sanitize(`<img src="${src}" alt="x" />`);

    expect(imageSrcs(sanitized)).toEqual([src]);
  });

  it('keeps a srcset candidate list on the same img', () => {
    const sanitized = sanitize(
      '<img src="0.b64.png" srcset="1.b64.png 1x, 2.b64.png 2x" alt="x" />',
    );

    expect(sanitized).toContain('1.b64.png 1x, 2.b64.png 2x');
  });

  it('keeps a lazy-loaded data-src on the same img', () => {
    const sanitized = sanitize(
      '<img src="placeholder.gif" data-src="3.b64.png" alt="x" />',
    );

    expect(sanitized).toContain('data-src="3.b64.png"');
  });

  it('still drops an <img src> on a javascript: scheme', () => {
    const sanitized = sanitize(
      '<img src="javascript:alert(1)" onerror="alert(2)" alt="x" />',
    );

    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('onerror');
  });
});
