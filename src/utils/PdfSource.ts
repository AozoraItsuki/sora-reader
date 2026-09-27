/**
 * PDF source helpers for the in-app viewer.
 *
 * `react-native-pdf-renderer` can only open a real file that lives on disk: its
 * Android view turns `source` into `new File(source.replace('file://', ''))`
 * and hands that to `ParcelFileDescriptor.open`, so a SAF `content://` uri
 * would resolve to a `File` that does not exist and fail to open.
 *
 * Anything that is not already a plain path therefore has to be materialized
 * into the app cache first:
 * - `content://` uris are copied with {@link NativeFile.copyFile}, which reads
 *   them back through a `ContentResolver`,
 * - `http(s)://` urls (including the local server that serves the download
 *   tree, see `resolveDownloadUrl`) are fetched with
 *   {@link NativeFile.downloadFile}.
 */
import NativeFile from '@specs/NativeFile';

/** Where materialized pdfs live, relative to the app cache directory. */
export const PDF_CACHE_DIR = 'pdf-viewer';

const PDF_EXTENSION = '.pdf';

/** Longest readable part of a cache file name, before the hash suffix. */
const MAX_NAME_LENGTH = 32;

/** Keeps the cache name hash inside an unsigned 32-bit range. */
const UINT32 = 2 ** 32;

/** How a source has to be prepared before the renderer can open it. */
export type PdfSourceKind = 'file' | 'content' | 'remote';

const CONTENT_SCHEME = /^content:\/\//i;
const REMOTE_SCHEME = /^https?:\/\//i;
const FILE_SCHEME = /^file:\/\//i;

/**
 * Rolling hash of the whole source, so cache names stay stable without pulling
 * in a hash dependency and two documents never share a cache file.
 */
const hash = (value: string): string => {
  let acc = 0;
  for (let i = 0; i < value.length; i++) {
    // `Math.imul` overflows into a signed 32-bit int, so the accumulator is
    // folded back into an unsigned range before it is used again.
    acc = (Math.imul(acc, 31) + value.charCodeAt(i)) % UINT32;
    if (acc < 0) {
      acc += UINT32;
    }
  }
  return acc.toString(16).padStart(8, '0');
};

/** How the renderer has to be fed for a given source. */
export const classifyPdfSource = (source: string): PdfSourceKind => {
  if (CONTENT_SCHEME.test(source)) {
    return 'content';
  }
  if (REMOTE_SCHEME.test(source)) {
    return 'remote';
  }
  return 'file';
};

/**
 * `true` when the renderer can open the source as it stands, without a copy.
 */
export const isPdfSourceReadable = (source: string): boolean =>
  classifyPdfSource(source) === 'file';

/**
 * The plain filesystem path of a source, without the `file://` wrapper.
 *
 * The renderer strips the scheme itself; this is for the code that has to touch
 * the file (cache lookups, the external viewer) instead.
 */
export const toPdfFilePath = (source: string): string =>
  decodeURIComponent(source.replace(FILE_SCHEME, ''));

/** Absolute path of the directory materialized pdfs are copied into. */
export const pdfCacheDirPath = (): string =>
  `${NativeFile.getConstants().ExternalCachesDirectoryPath}/${PDF_CACHE_DIR}`;

/**
 * Deterministic cache path for a source.
 *
 * The name is derived from the source itself, so re-opening the same document
 * reuses the copy instead of downloading or copying it again, and two different
 * documents never collide.
 */
export const pdfCacheFilePath = (source: string): string => {
  const rawName = source.split('/').pop() ?? '';
  const stem = toPdfFilePath(rawName)
    .replace(new RegExp(`${PDF_EXTENSION}$`, 'i'), '')
    // Anything outside this set would need quoting in a path, so flatten it.
    .replace(/[^a-z0-9._-]/gi, '_')
    .replace(/^[._-]+/, '')
    .slice(0, MAX_NAME_LENGTH);
  return `${pdfCacheDirPath()}/${stem || 'document'}-${hash(
    source,
  )}${PDF_EXTENSION}`;
};

/** Drops every materialized pdf, e.g. after the user clears the app cache. */
export const clearPdfCache = (): void => {
  NativeFile.unlink(pdfCacheDirPath());
};

const materialize = async (source: string, destPath: string): Promise<void> => {
  // `mkdir` creates the parents and does nothing when they already exist.
  NativeFile.mkdir(pdfCacheDirPath());

  if (classifyPdfSource(source) === 'content') {
    NativeFile.copyFile(source, destPath);
    return;
  }

  await NativeFile.downloadFile(source, destPath, 'GET', {});
};

/**
 * Resolve a source into a path the renderer can open.
 *
 * Local paths are returned as they are; everything else is copied or
 * downloaded into the app cache. The cache copy is reused when it is already
 * there, so switching screens does not copy the same document twice.
 */
export const resolvePdfSource = async (source: string): Promise<string> => {
  if (isPdfSourceReadable(source)) {
    return toPdfFilePath(source);
  }

  const destPath = pdfCacheFilePath(source);
  if (NativeFile.exists(destPath)) {
    return destPath;
  }

  try {
    await materialize(source, destPath);
  } catch (error) {
    // A half-written copy would be served as if it were the document itself.
    NativeFile.unlink(destPath);
    throw new Error(
      `Failed to open the PDF at "${source}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return destPath;
};

/**
 * A human readable title for a source, e.g. `report.pdf` for
 * `content://…/document/report.pdf`.
 */
export const pdfDisplayName = (source: string, fallback = 'PDF'): string => {
  const name = toPdfFilePath(source).split('/').pop() ?? '';
  return name || fallback;
};
