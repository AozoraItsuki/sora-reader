import NativeFile from '@specs/NativeFile';

import {
  classifyPdfSource,
  clearPdfCache,
  isPdfSourceReadable,
  PDF_CACHE_DIR,
  pdfCacheDirPath,
  pdfCacheFilePath,
  pdfDisplayName,
  resolvePdfSource,
  toPdfFilePath,
} from '../PdfSource';

const nativeFile = NativeFile as jest.Mocked<typeof NativeFile>;

const CACHE_DIR = '/mock/caches/pdf-viewer';
const CONTENT_URI =
  'content://com.android.providers.downloads.documents/document/msf%3A1000000123';
const REMOTE_URL = 'https://example.com/files/report.pdf';
const LOCAL_PATH = '/storage/emulated/0/Download/novel.pdf';

beforeEach(() => {
  // `clearMocks` is a top-level option, which jest does not forward to the
  // projects, so the shared native mock is reset here.
  jest.clearAllMocks();
  nativeFile.exists.mockReturnValue(false);
  nativeFile.mkdir.mockImplementation(() => undefined);
  nativeFile.unlink.mockImplementation(() => undefined);
  nativeFile.copyFile.mockImplementation(() => undefined);
  nativeFile.downloadFile.mockResolvedValue(undefined);
});

describe('classifyPdfSource', () => {
  it('spots SAF content uris whatever their case', () => {
    expect(classifyPdfSource(CONTENT_URI)).toBe('content');
    expect(classifyPdfSource('CONTENT://media/external/file/42')).toBe(
      'content',
    );
  });

  it('spots http and https urls, including the local download server', () => {
    expect(classifyPdfSource(REMOTE_URL)).toBe('remote');
    expect(classifyPdfSource('http://127.0.0.1:54321/Novels/a/b.pdf')).toBe(
      'remote',
    );
  });

  it('treats every other value as a path on disk', () => {
    expect(classifyPdfSource(LOCAL_PATH)).toBe('file');
    expect(classifyPdfSource(`file://${LOCAL_PATH}`)).toBe('file');
  });

  it('only promises a plain path can be opened as it stands', () => {
    expect(isPdfSourceReadable(LOCAL_PATH)).toBe(true);
    expect(isPdfSourceReadable(`file://${LOCAL_PATH}`)).toBe(true);
    expect(isPdfSourceReadable(CONTENT_URI)).toBe(false);
    expect(isPdfSourceReadable(REMOTE_URL)).toBe(false);
  });
});

describe('toPdfFilePath', () => {
  it('drops the file scheme and unescapes the path', () => {
    expect(toPdfFilePath('file:///storage/My%20Novels/a.pdf')).toBe(
      '/storage/My Novels/a.pdf',
    );
  });

  it('leaves a plain path alone', () => {
    expect(toPdfFilePath(LOCAL_PATH)).toBe(LOCAL_PATH);
  });
});

describe('pdfCacheFilePath', () => {
  it('keeps materialized pdfs in their own cache directory', () => {
    expect(pdfCacheDirPath()).toBe(CACHE_DIR);
    expect(PDF_CACHE_DIR).toBe('pdf-viewer');
    expect(pdfCacheFilePath(CONTENT_URI).startsWith(`${CACHE_DIR}/`)).toBe(
      true,
    );
  });

  it('always ends up a pdf file', () => {
    expect(pdfCacheFilePath(REMOTE_URL).endsWith('.pdf')).toBe(true);
    expect(pdfCacheFilePath(CONTENT_URI).endsWith('.pdf')).toBe(true);
  });

  it('is stable for the same source so a document is only copied once', () => {
    expect(pdfCacheFilePath(REMOTE_URL)).toBe(pdfCacheFilePath(REMOTE_URL));
  });

  it('keeps two different documents apart', () => {
    expect(pdfCacheFilePath(REMOTE_URL)).not.toBe(
      pdfCacheFilePath('https://example.com/files/other.pdf'),
    );
    expect(pdfCacheFilePath(CONTENT_URI)).not.toBe(
      pdfCacheFilePath('content://media/external/file/42'),
    );
  });

  it('sanitizes characters that would need quoting in a path', () => {
    const path = pdfCacheFilePath('content://x/document/My Novel (v2).pdf');
    expect(path).not.toContain(' ');
    expect(path).not.toContain('(');
    expect(path).not.toContain(')');
    expect(path.startsWith(`${CACHE_DIR}/My_Novel__v2_-`)).toBe(true);
  });

  it('truncates a long name instead of blowing past the path limit', () => {
    const name = `${'a'.repeat(200)}.pdf`;
    const fileName = pdfCacheFilePath(`content://x/document/${name}`)
      .split('/')
      .pop() as string;

    // 32 readable characters, a dash, the 8 character hash and the extension.
    expect(fileName).toHaveLength(32 + 1 + 8 + '.pdf'.length);
    expect(fileName.endsWith('.pdf')).toBe(true);
  });

  it('falls back to a generic name when the source carries no file name', () => {
    expect(pdfCacheFilePath('https://example.com/')).toMatch(
      new RegExp(`^${CACHE_DIR}/document-[0-9a-f]{8}\\.pdf$`),
    );
  });
});

describe('resolvePdfSource', () => {
  it('returns a local path without touching the file system', async () => {
    await expect(resolvePdfSource(LOCAL_PATH)).resolves.toBe(LOCAL_PATH);

    expect(nativeFile.copyFile).not.toHaveBeenCalled();
    expect(nativeFile.downloadFile).not.toHaveBeenCalled();
    expect(nativeFile.mkdir).not.toHaveBeenCalled();
  });

  it('unwraps a file uri into the plain path the renderer wants', async () => {
    await expect(resolvePdfSource(`file://${LOCAL_PATH}`)).resolves.toBe(
      LOCAL_PATH,
    );
    expect(nativeFile.copyFile).not.toHaveBeenCalled();
  });

  it('copies a SAF content uri into the cache before viewing it', async () => {
    // Given: a uri from the picker, which the renderer cannot open directly.
    const cachePath = pdfCacheFilePath(CONTENT_URI);

    // When:
    const resolved = await resolvePdfSource(CONTENT_URI);

    // Then: it lands on disk first, and the cache copy is what gets opened.
    expect(nativeFile.mkdir).toHaveBeenCalledWith(CACHE_DIR);
    expect(nativeFile.copyFile).toHaveBeenCalledWith(CONTENT_URI, cachePath);
    expect(resolved).toBe(cachePath);
    expect(nativeFile.downloadFile).not.toHaveBeenCalled();
  });

  it('downloads a remote url into the cache before viewing it', async () => {
    const cachePath = pdfCacheFilePath(REMOTE_URL);

    const resolved = await resolvePdfSource(REMOTE_URL);

    expect(nativeFile.mkdir).toHaveBeenCalledWith(CACHE_DIR);
    expect(nativeFile.downloadFile).toHaveBeenCalledWith(
      REMOTE_URL,
      cachePath,
      'GET',
      {},
    );
    expect(resolved).toBe(cachePath);
  });

  it('reuses the cached copy instead of copying the same document again', async () => {
    nativeFile.exists.mockImplementation(
      path => path === pdfCacheFilePath(CONTENT_URI),
    );

    await expect(resolvePdfSource(CONTENT_URI)).resolves.toBe(
      pdfCacheFilePath(CONTENT_URI),
    );

    expect(nativeFile.copyFile).not.toHaveBeenCalled();
    expect(nativeFile.mkdir).not.toHaveBeenCalled();
  });

  it('reports the source it could not open and drops the partial copy', async () => {
    // Given: a uri that no longer resolves to a readable file.
    nativeFile.copyFile.mockImplementation(() => {
      throw new Error('ENOENT: no such document');
    });

    // When / Then: the failure names the source, and nothing half-written is
    // left behind to be served as the document.
    await expect(resolvePdfSource(CONTENT_URI)).rejects.toThrow(
      /content:\/\/com\.android\.providers[\s\S]*ENOENT: no such document/,
    );
    expect(nativeFile.unlink).toHaveBeenCalledWith(
      pdfCacheFilePath(CONTENT_URI),
    );
  });

  it('reports a failed download with the url that caused it', async () => {
    nativeFile.downloadFile.mockRejectedValue(new Error('HTTP 404'));

    await expect(resolvePdfSource(REMOTE_URL)).rejects.toThrow(
      /https:\/\/example\.com\/files\/report\.pdf[\s\S]*HTTP 404/,
    );
    expect(nativeFile.unlink).toHaveBeenCalledWith(
      pdfCacheFilePath(REMOTE_URL),
    );
  });

  it('keeps a cached copy the renderer already rejected', async () => {
    // Given: a document the native renderer refused, so the bytes are still in
    // the cache.
    nativeFile.exists.mockReturnValue(true);

    // When / Then: the cache path is handed back rather than downloaded again,
    // and the renderer stays the one deciding whether it is readable.
    await expect(resolvePdfSource(REMOTE_URL)).resolves.toBe(
      pdfCacheFilePath(REMOTE_URL),
    );
    expect(nativeFile.downloadFile).not.toHaveBeenCalled();
  });
});

describe('clearPdfCache', () => {
  it('drops every materialized pdf', () => {
    clearPdfCache();

    expect(nativeFile.unlink).toHaveBeenCalledWith(CACHE_DIR);
  });
});

describe('pdfDisplayName', () => {
  it('reads the file name out of a content uri', () => {
    expect(pdfDisplayName('content://x/document/Report%20final.pdf')).toBe(
      'Report final.pdf',
    );
  });

  it('falls back when the source has no file name', () => {
    expect(pdfDisplayName('https://example.com/')).toBe('PDF');
    expect(pdfDisplayName('', 'Document')).toBe('Document');
  });
});
