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
 * Two backends answer for that layout:
 *
 * - `direct` (default): absolute paths under `SHARED_ROOT`, reachable with
 *   `java.io.File` once the user grants all-files access — Mihon-style, no
 *   picker, and the files are visible to any file manager;
 * - `tree` (fallback): the `content://` tree the user picked, resolved through
 *   `DocumentFile` + `ContentResolver` in [NativeSaf]. Never touched with
 *   `java.io.File`.
 *
 * The tree uri lives in MMKV under [SAF_DOWNLOAD_TREE_URI]. Every operation
 * below branches on [isDirectStorageReady], so the two modes stay
 * interchangeable for callers.
 */
import { pickDirectory } from '@react-native-documents/picker';
import NativeSaf from '@specs/NativeSaf';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { StorageAccessFramework } from 'expo-file-system/legacy';

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
} from './directStorage';

export { ensureDirectStorage, getDirectRootAbsolute, isDirectStorageReady };

/** MMKV key holding the persisted `content://` tree uri. */
export const SAF_DOWNLOAD_TREE_URI = 'SAF_DOWNLOAD_TREE_URI';
/** MMKV key set to `'1'` once the legacy app-private storage was migrated. */
export const SAF_MIGRATION_DONE = 'SAF_MIGRATION_DONE';
/** Folder name the picker starts from when the user has one. */
export const SAF_FOLDER_NAME = 'SoraReader';
/** Root segment of the download layout inside the picked tree. */
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
 * Result of the last permission probe, so the synchronous [isSafReady] can
 * report a tree whose grant was revoked. `null` means "not probed yet".
 */
let lastKnownPermission: boolean | null = null;

const normalizeTreeUri = (uri: string): string =>
  uri.trim().replace(/\/+$/, '');

/** Persisted tree uri, or null when the user never picked a folder. */
export const getSafTreeUri = (): string | null => {
  const stored = MMKVStorage.getString(SAF_DOWNLOAD_TREE_URI);
  return stored ? normalizeTreeUri(stored) : null;
};

/** Persist (or clear, with null) the tree uri. */
export const setSafTreeUri = (uri: string | null): void => {
  if (!uri) {
    MMKVStorage.remove(SAF_DOWNLOAD_TREE_URI);
    lastKnownPermission = null;
    return;
  }
  MMKVStorage.set(SAF_DOWNLOAD_TREE_URI, normalizeTreeUri(uri));
  lastKnownPermission = null;
};

/**
 * True when downloads can be read and written: the shared root is granted, or a
 * tree is configured and was not found to be inaccessible.
 * Synchronous by design — call [ensureDirectStorage] or [ensureSafPermission]
 * for the authoritative answer, which re-takes the grant after a reboot.
 */
export const isSafReady = (): boolean =>
  isDirectStorageReady() ||
  (getSafTreeUri() !== null && lastKnownPermission !== false);

export const isSafMigrationDone = (): boolean =>
  MMKVStorage.getString(SAF_MIGRATION_DONE) === '1';

export const markSafMigrationDone = (): void => {
  MMKVStorage.set(SAF_MIGRATION_DONE, '1');
};

const requireTreeUri = (): string => {
  const treeUri = getSafTreeUri();
  if (!treeUri) {
    throw new Error(
      `[saf] No download folder picked yet (${SAF_DOWNLOAD_TREE_URI} is unset)`,
    );
  }
  return treeUri;
};

/**
 * Normalize a tree-relative path and refuse anything that could escape the
 * tree (`..`, absolute uris, scheme prefixes).
 */
export const normalizeSafPath = (
  relPath: string,
  { allowRoot = false }: { allowRoot?: boolean } = {},
): string => {
  if (typeof relPath !== 'string' || relPath.includes('://')) {
    throw new Error(`[saf] Not a tree-relative path: ${String(relPath)}`);
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

/** Absolute document uri of a tree-relative path; for readers and `<img src>`. */
export const safDocumentUri = (relPath: string): string => {
  const rel = normalizeSafPath(relPath);
  if (isDirectStorageReady()) {
    return `file://${directAbsolutePath(rel)}`;
  }
  return `${requireTreeUri()}/${rel}`;
};

/**
 * Re-take the persisted grant for the stored tree, which is what brings access
 * back after a reboot. False means the user has to pick the folder again.
 */
export const ensureSafPermission = async (): Promise<boolean> => {
  const treeUri = getSafTreeUri();
  if (!treeUri) {
    lastKnownPermission = false;
    return false;
  }
  try {
    await NativeSaf.takePersistablePermission(treeUri, true);
    lastKnownPermission = await NativeSaf.hasTreeAccess(treeUri);
  } catch (error) {
    console.warn('[saf] Could not restore the download folder grant', error);
    lastKnownPermission = false;
  }
  return lastKnownPermission;
};

/**
 * Ask the user for a download folder, then persist the grant and the uri.
 *
 * Uses the SAF directory picker (the same flow as the custom-cover export in
 * `NovelScreenList`), starting from a folder named `SoraReader` when the
 * device has one, and falls back to the document picker when SAF is
 * unavailable. Resolves false when the user cancels or the folder cannot be
 * written to.
 */
export const pickDownloadFolder = async (): Promise<boolean> => {
  const picked = await pickSafDirectory();
  if (!picked) {
    return false;
  }
  const treeUri = normalizeTreeUri(picked);
  let accessible = false;
  try {
    // Best effort: some providers refuse persistable grants, which only costs
    // us the grant after a process death.
    await NativeSaf.takePersistablePermission(treeUri, true);
  } catch (error) {
    console.warn('[saf] Provider refused a persistable grant', error);
  }
  try {
    accessible = await NativeSaf.hasTreeAccess(treeUri);
  } catch (error) {
    console.warn('[saf] Picked folder is not accessible', error);
  }
  if (!accessible) {
    lastKnownPermission = false;
    return false;
  }
  MMKVStorage.set(SAF_DOWNLOAD_TREE_URI, treeUri);
  lastKnownPermission = true;
  return true;
};

/** Forget the current folder and drop its persisted grant. */
export const clearSafFolder = async (): Promise<boolean> => {
  const treeUri = getSafTreeUri();
  if (treeUri) {
    try {
      await NativeSaf.releaseTreeUri(treeUri);
    } catch (error) {
      console.warn('[saf] Could not release the download folder', error);
    }
  }
  MMKVStorage.remove(SAF_DOWNLOAD_TREE_URI);
  lastKnownPermission = null;
  return true;
};

/** Create `relPath` and every missing parent directory. Idempotent. */
export const safMkdir = async (relPath: string): Promise<boolean> => {
  const rel = normalizeSafPath(relPath);
  if (isDirectStorageReady()) {
    directMkdir(directAbsolutePath(rel));
    return true;
  }
  return NativeSaf.mkdir(requireTreeUri(), rel);
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
  if (isDirectStorageReady()) {
    await directWriteFile(directAbsolutePath(rel), data, encoding);
    return true;
  }
  return NativeSaf.writeFile(requireTreeUri(), rel, data, encoding);
};

/** Read `relPath` as `utf8` text or `base64`, per `encoding`. */
export const safReadFile = async (
  relPath: string,
  encoding: SafEncoding = 'utf8',
): Promise<string> => {
  const rel = normalizeSafPath(relPath);
  if (isDirectStorageReady()) {
    return directReadFile(directAbsolutePath(rel), encoding);
  }
  return NativeSaf.readFile(requireTreeUri(), rel, encoding);
};

export const safExists = async (relPath: string): Promise<boolean> => {
  const rel = normalizeSafPath(relPath, { allowRoot: true });
  if (isDirectStorageReady()) {
    return directExists(directAbsolutePath(rel));
  }
  return NativeSaf.exists(requireTreeUri(), rel);
};

/** Recursively remove a file or directory. Resolves false when absent. */
export const safUnlink = async (relPath: string): Promise<boolean> => {
  const rel = normalizeSafPath(relPath);
  if (isDirectStorageReady()) {
    return directUnlink(directAbsolutePath(rel));
  }
  return NativeSaf.unlink(requireTreeUri(), rel);
};

/** Display names of the direct children; an empty string lists the root. */
export const safReadDir = async (relPath: string): Promise<string[]> => {
  const rel = normalizeSafPath(relPath, { allowRoot: true });
  if (isDirectStorageReady()) {
    return directReadDir(directAbsolutePath(rel));
  }
  return NativeSaf.readDir(requireTreeUri(), rel);
};

/** Move a file or directory inside the download root, replacing the destination. */
export const safMove = async (
  oldRelPath: string,
  newRelPath: string,
): Promise<boolean> => {
  const from = normalizeSafPath(oldRelPath);
  const to = normalizeSafPath(newRelPath);
  if (isDirectStorageReady()) {
    directMove(directAbsolutePath(from), directAbsolutePath(to));
    return true;
  }
  return NativeSaf.move(requireTreeUri(), from, to);
};

/** Size in bytes; 0 when the path is missing. */
export const safGetFileSize = async (relPath: string): Promise<number> => {
  const rel = normalizeSafPath(relPath);
  if (isDirectStorageReady()) {
    return directGetFileSize(directAbsolutePath(rel));
  }
  return NativeSaf.getFileSize(requireTreeUri(), rel);
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
  if (isDirectStorageReady()) {
    await directDownloadFile(
      url,
      directAbsolutePath(rel),
      method,
      headers,
      body,
    );
    return true;
  }
  return NativeSaf.downloadFile(
    requireTreeUri(),
    url,
    rel,
    method,
    headers,
    body,
  );
};

/**
 * Read a downloaded chapter, or null when it is not in the tree yet. Callers
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

const isCancellation = (error: unknown): boolean =>
  String((error as { code?: string } | null)?.code ?? '')
    .toUpperCase()
    .includes('CANCEL');

const pickSafDirectory = async (): Promise<string | null> => {
  let initialUri: string | null = null;
  try {
    // Opening the picker on an existing SoraReader folder is friendlier; the
    // uri is simply ignored when no such folder exists.
    initialUri =
      StorageAccessFramework.getUriForDirectoryInRoot(SAF_FOLDER_NAME);
  } catch (error) {
    console.warn('[saf] No initial folder for the picker', error);
  }

  try {
    const result =
      await StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
    // An explicit answer from the user: never prompt twice in a row.
    return result.granted ? result.directoryUri ?? null : null;
  } catch (error) {
    if (isCancellation(error)) {
      return null;
    }
    console.warn(
      '[saf] SAF picker unavailable, using the document picker',
      error,
    );
  }

  try {
    const result = await pickDirectory({ requestLongTermAccess: true });
    return result?.uri ?? null;
  } catch (error) {
    if (!isCancellation(error)) {
      console.warn('[saf] Could not pick a download folder', error);
    }
    return null;
  }
};
