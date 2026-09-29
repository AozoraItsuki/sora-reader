/**
 * Storage backend for the download folder.
 *
 * Every path handled here is RELATIVE to the download root, using the same
 * layout the app-private storage used, so nothing downstream has to care where
 * the bytes actually live:
 *
 *   Novels/{pluginId}/{novelId}/cover.png
 *   Novels/{pluginId}/{novelId}/{chapterId}/index.html
 *   Novels/{pluginId}/{novelId}/{chapterId}/{i}.b64.png
 *
 * There is exactly one backend: `direct` — absolute paths under `SHARED_ROOT`,
 * reachable with `java.io.File` once the user grants all-files access.
 * Mihon-style, no picker, and the files are visible to any file manager.
 * The old SAF-tree fallback was deleted; the app gate forces the access
 * grant before anything else renders.
 */
import { MMKVStorage } from '@utils/mmkv/mmkv';

import {
  directAbsolutePath,
  directDownloadFile,
  directExists,
  directGetFileSize,
  directMkdir,
  directMove,
  directReadDir,
  directReadFile,
  directUnlink,
  directWriteFile,
  ensureDirectStorage,
  getDirectRootAbsolute,
  isDirectStorageReady,
  probeDirectStorage,
} from './directStorage';

export {
  ensureDirectStorage,
  getDirectRootAbsolute,
  isDirectStorageReady,
  probeDirectStorage,
};

/** MMKV key set to `'1'` once the legacy app-private storage was migrated. */
export const SAF_MIGRATION_DONE = 'SAF_MIGRATION_DONE';
/** Root segment of the download layout inside the shared root. */
export const SAF_TREE_ROOT = 'Novels';

export type SafEncoding = 'utf8' | 'base64';

/** Accepts a plugin `imageRequestInit`, a bare header map, or nothing. */
export type SafRequestInit = {
  method?: string;
  headers?: Record<string, string> | Headers;
  body?: string;
  // Plugins pass extra fetch options through (`userAgent`, credentials, ...).
  [key: string]: unknown;
};

/**
 * True when downloads can be read and written, i.e. the shared root is
 * granted. Kept under the old name so callers do not churn.
 *
 * Synchronous by design — this only reports the last probe, so a read on the
 * first frames after boot (before [ensureDirectStorage] has settled) has to ask
 * `isSafReady() || probeDirectStorage()` instead of trusting the cache alone.
 */
export const isSafReady = (): boolean => isDirectStorageReady();

export const isSafMigrationDone = (): boolean =>
  MMKVStorage.getString(SAF_MIGRATION_DONE) === '1';

export const markSafMigrationDone = (): void => {
  MMKVStorage.set(SAF_MIGRATION_DONE, '1');
};

/**
 * Normalize a download-root-relative path and refuse anything that could
 * escape the root (`..`, absolute uris, scheme prefixes).
 */
export const normalizeSafPath = (
  relPath: string,
  { allowRoot = false }: { allowRoot?: boolean } = {},
): string => {
  if (typeof relPath !== 'string' || relPath.includes('://')) {
    throw new Error(`[saf] Not a download-root-relative path: ${String(relPath)}`);
  }
  const segments = relPath.split('/').filter(segment => segment.length > 0);
  if (segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error(`[saf] Unsafe path: ${relPath}`);
  }
  if (segments.length === 0 && !allowRoot) {
    throw new Error(`[saf] Empty path: ${relPath}`);
  }
  return segments.join('/');
};

/** Absolute document uri of a download-root-relative path; for readers and `<img src>`. */
export const safDocumentUri = (relPath: string): string => {
  const rel = normalizeSafPath(relPath);
  return `file://${directAbsolutePath(rel)}`;
};

/** Create `relPath` and every missing parent directory. Idempotent. */
export const safMkdir = async (relPath: string): Promise<boolean> => {
  const rel = normalizeSafPath(relPath);
  directMkdir(directAbsolutePath(rel));
  return true;
};

/**
 * Write (overwriting) `data` at `relPath`. `encoding` selects how the string is
 * decoded into bytes; the stored MIME type is sniffed natively.
 */
export const safWriteFile = async (
  relPath: string,
  data: string,
  encoding: SafEncoding = 'utf8',
): Promise<boolean> => {
  const rel = normalizeSafPath(relPath);
  await directWriteFile(directAbsolutePath(rel), data, encoding);
  return true;
};

/** Read `relPath` as `utf8` text or `base64`, per `encoding`. */
export const safReadFile = async (
  relPath: string,
  encoding: SafEncoding = 'utf8',
): Promise<string> => {
  const rel = normalizeSafPath(relPath);
  return directReadFile(directAbsolutePath(rel), encoding);
};

export const safExists = async (relPath: string): Promise<boolean> => {
  const rel = normalizeSafPath(relPath, { allowRoot: true });
  return directExists(directAbsolutePath(rel));
};

/** Recursively remove a file or directory. Resolves false when absent. */
export const safUnlink = async (relPath: string): Promise<boolean> => {
  const rel = normalizeSafPath(relPath);
  return directUnlink(directAbsolutePath(rel));
};

/** Display names of the direct children; an empty string lists the root. */
export const safReadDir = async (relPath: string): Promise<string[]> => {
  const rel = normalizeSafPath(relPath, { allowRoot: true });
  return directReadDir(directAbsolutePath(rel));
};

/** Move a file or directory inside the download root, replacing the destination. */
export const safMove = async (
  oldRelPath: string,
  newRelPath: string,
): Promise<boolean> => {
  const from = normalizeSafPath(oldRelPath);
  const to = normalizeSafPath(newRelPath);
  directMove(directAbsolutePath(from), directAbsolutePath(to));
  return true;
};

/** Size in bytes; 0 when the path is missing. */
export const safGetFileSize = async (relPath: string): Promise<number> => {
  const rel = normalizeSafPath(relPath);
  return directGetFileSize(directAbsolutePath(rel));
};

/**
 * Download `url` straight into the download root, gzip-decoding and
 * MIME-sniffing natively. `init` accepts a plugin request init, a bare header
 * map, or nothing, so `plugin.imageRequestInit` keeps working.
 */
export const safDownloadFile = async (
  url: string,
  relPath: string,
  init?: SafRequestInit,
): Promise<boolean> => {
  const rel = normalizeSafPath(relPath);
  const method = (init?.method || 'get').toLowerCase();
  const headers = toHeaderMap(init);
  const body = typeof init?.body === 'string' ? init.body : undefined;
  await directDownloadFile(
    url,
    directAbsolutePath(rel),
    method,
    headers,
    body,
  );
  return true;
};

/**
 * Read a downloaded chapter, or null when it is not on disk yet. Callers
 * fall back to fetching the chapter from its source.
 */
export const readDownloadedChapter = async (
  relPath: string,
): Promise<string | null> => {
  try {
    if (!(await safExists(relPath))) {
      return null;
    }
    return await safReadFile(relPath, 'utf8');
  } catch (error) {
    console.warn('[saf] Could not read a downloaded chapter', error);
    return null;
  }
};

const toHeaderMap = (init?: SafRequestInit): Record<string, string> => {
  const raw = init?.headers;
  if (!raw) {
    return {};
  }
  const headers: Record<string, string> = {};
  if (typeof Headers !== 'undefined' && raw instanceof Headers) {
    raw.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === 'string') {
      headers[key] = value;
    }
  });
  return headers;
};
