import { absolutizeAssetRefs, chapterBaseUrl } from '../chapterAssetUrls';

const SERVER = 'http://127.0.0.1:1234';
const NOVEL = { id: 9, pluginId: 'local' };

describe('chapterBaseUrl', () => {
  it('serves a local novel from its own chapter directory', () => {
    // Page images sit next to the chapter's index.html, so the base URL must
    // name the chapter — anchoring at the novel directory leaves `0.b64.png`
    // pointing at a folder that has no such file.
    expect(
      chapterBaseUrl({
        novel: { ...NOVEL, isLocal: true },
        chapter: { id: 2, isDownloaded: true },
        serverUrl: SERVER,
      }),
    ).toBe(`${SERVER}/local/9/2/`);
  });

  it('serves a downloaded chapter from its own chapter directory', () => {
    // The chapter directory is what a downloaded chapter's `0.b64.png`
    // references are anchored to, so this URL must name the chapter. The
    // local server already serves the shared Novels root itself, so the
    // `Novels` segment must NOT be repeated.
    expect(
      chapterBaseUrl({
        novel: { ...NOVEL, isLocal: false },
        chapter: { id: 4, isDownloaded: true },
        serverUrl: SERVER,
      }),
    ).toBe(`${SERVER}/local/9/4/`);
  });

  it('resolves a chapter that is neither local nor downloaded against its plugin site', () => {
    expect(
      chapterBaseUrl({
        novel: { ...NOVEL, pluginId: 'dummy', isLocal: false },
        chapter: { id: 4, isDownloaded: false },
        pluginSite: 'https://example.com',
        serverUrl: SERVER,
      }),
    ).toBe('https://example.com');
  });
});

describe('absolutizeAssetRefs', () => {
  const base = `${SERVER}/local/9/4/`;

  it('anchors a relative img src to the chapter base url', () => {
    expect(absolutizeAssetRefs('<img src="0.b64.png" alt="a" />', base)).toBe(
      `<img src="${base}0.b64.png" alt="a" />`,
    );
  });

  it('anchors every srcset candidate and keeps its descriptor', () => {
    expect(
      absolutizeAssetRefs('<img srcset="1.b64.png 1x, 2.b64.png 2x" />', base),
    ).toBe(`<img srcset="${base}1.b64.png 1x, ${base}2.b64.png 2x" />`);
  });

  it('anchors a lazy data-src and a relative stylesheet href', () => {
    expect(
      absolutizeAssetRefs(
        '<link href="main.css"><img src="a.gif" data-src="3.b64.png" />',
        base,
      ),
    ).toBe(
      `<link href="${base}main.css"><img src="${base}a.gif" data-src="${base}3.b64.png" />`,
    );
  });

  it('keeps a reference that already addresses something on its own', () => {
    const html =
      '<img src="https://cdn.example.com/a.png">' +
      '<img src="content://tree/a.png">' +
      '<img src="data:image/png;base64,AA">' +
      '<a href="#top">top</a>';

    expect(absolutizeAssetRefs(html, base)).toBe(html);
  });

  it('leaves the html alone when there is no base url to anchor to', () => {
    const html = '<img src="0.b64.png" />';

    expect(absolutizeAssetRefs(html, '')).toBe(html);
  });

  it('anchors every page of an appended image chapter to its own directory', () => {
    // Infinite scroll appends the next chapter's markup into the live document,
    // so each page image has to resolve against that chapter's base URL rather
    // than the one the document was loaded with.
    const appended = absolutizeAssetRefs(
      '<img class="pdf-page-image" src="0.b64.png">' +
        '<img class="pdf-page-image" src="1.b64.png">',
      base,
    );

    expect(appended).toBe(
      `<img class="pdf-page-image" src="${base}0.b64.png">` +
        `<img class="pdf-page-image" src="${base}1.b64.png">`,
    );
  });

  it('keeps protocol-relative references instead of resolving them', () => {
    // `//cdn/x.png` inherits the document scheme, so anchoring it would pin it
    // to the local server.
    const html = '<img src="//cdn.example.com/a.png">';

    expect(absolutizeAssetRefs(html, base)).toBe(html);
  });

  it('anchors every srcset candidate and normalizes its spacing', () => {
    // Extra whitespace around a candidate must not end up inside the anchored
    // URL, and the descriptor has to stay attached to its own candidate.
    expect(
      absolutizeAssetRefs(
        '<img srcset="  1.b64.png 1x , 2.b64.png 2x  ">',
        base,
      ),
    ).toBe(`<img srcset="${base}1.b64.png 1x, ${base}2.b64.png 2x">`);
  });
});
