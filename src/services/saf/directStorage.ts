/**
 * Direct backend for the download folder: plain absolute paths under
 * [SHARED_ROOT] instead of a user-picked SAF tree.
 *
 * Once the user grants "all files access", `{SHARED_ROOT}/Novels/...` is
 * addressed with `java.io.File` through [NativeFile] — the same layout the tree
 * backend uses, so no consumer above `safFile.ts` can tell the difference.
 *
 * Only what `java.io.File` cannot do is delegated to expo-file-system: base64
 * payloads need byte-level decoding, and expo takes `file://` URIs.
 *
 * Every function here takes an ABSOLUTE path built by [directAbsolutePath]; the
 * caller owns the relative-path validation.
 */
import NativeFile from '@specs/NativeFile';
import { SHARED_ROOT } from '@utils/Storages';
import {
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

export type DirectEncoding = 'utf8' | 'base64';

/**
 * Result of the last all-files probe, so the synchronous [isDirectStorageReady]
 * can be asked on the first render. `null` means "not probed yet".
 */
let lastKnownDirectAccess: boolean | null = null;

/**
 * True when the shared download root is granted and known, which is what makes
 * this backend usable. Synchronous by design — call [ensureDirectStorage] for
 * the authoritative answer, which re-reads the permission after a reboot.
 */
export const isDirectStorageReady = (): boolean =>
  lastKnownDirectAccess === true && SHARED_ROOT !== '';

/** Re-read the all-files permission and cache the answer. */
export const ensureDirectStorage = async (): Promise<boolean> => {
  try {
    lastKnownDirectAccess = NativeFile.hasAllFilesAccess();
  } catch (error) {
    console.warn('[saf] Could not read the all-files permission', error);
    lastKnownDirectAccess = false;
  }
  return isDirectStorageReady();
};

/** Absolute shared download root, or null while direct storage is unusable. */
export const getDirectRootAbsolute = (): string | null =>
  isDirectStorageReady() ? SHARED_ROOT : null;

/** Absolute path of a tree-relative path inside the shared download root. */
export const directAbsolutePath = (relPath: string): string => {
  const root = getDirectRootAbsolute();
  if (!root) {
    throw new Error('[saf] All-files access has not been granted');
  }
  return relPath ? `${root}/${relPath}` : root;
};

/** expo-file-system only addresses `file://` URIs, never bare paths. */
const fileUri = (absPath: string): string =>
  absPath.startsWith('file://') ? absPath : `file://${absPath}`;

/** Create `absPath` and every missing parent directory. Idempotent. */
export const directMkdir = (absPath: string): void => {
  NativeFile.mkdir(absPath);
};

export const directExists = (absPath: string): boolean =>
  NativeFile.exists(absPath);

/**
 * Write (overwriting) `data` at `absPath`. Missing parents are created, which
 * is what the tree backend does for the same call.
 */
export const directWriteFile = async (
  absPath: string,
  data: string,
  encoding: DirectEncoding,
): Promise<void> => {
  const slash = absPath.lastIndexOf('/');
  if (slash > 0) {
    NativeFile.mkdir(absPath.slice(0, slash));
  }
  if (encoding === 'utf8') {
    NativeFile.writeFile(absPath, data);
    return;
  }
  // `java.io.File` has no byte-level write, so expo decodes the base64 payload.
  await writeAsStringAsync(fileUri(absPath), data, {
    encoding: EncodingType.Base64,
  });
};

/** Read `absPath` as `utf8` text or decoded `base64`, per `encoding`. */
export const directReadFile = async (
  absPath: string,
  encoding: DirectEncoding,
): Promise<string> => {
  if (encoding === 'utf8') {
    return NativeFile.readFile(absPath);
  }
  return readAsStringAsync(fileUri(absPath), { encoding: EncodingType.Base64 });
};

/** Recursively remove a file or directory. Reports whether anything was there. */
export const directUnlink = (absPath: string): boolean => {
  if (!NativeFile.exists(absPath)) {
    return false;
  }
  NativeFile.unlink(absPath);
  return true;
};

/** Display names of the direct children. */
export const directReadDir = (absPath: string): string[] =>
  NativeFile.readDir(absPath).map(entry => entry.name);

/** Move a file or directory, replacing the destination. */
export const directMove = (fromAbsPath: string, toAbsPath: string): void => {
  NativeFile.moveFile(fromAbsPath, toAbsPath);
};

export const directGetFileSize = (absPath: string): number =>
  NativeFile.getFileSize(absPath);

/** Download `url` straight to `absPath`, gzip-decoding natively. */
export const directDownloadFile = async (
  url: string,
  absPath: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<void> => {
  await NativeFile.downloadFile(url, absPath, method, headers, body);
};
