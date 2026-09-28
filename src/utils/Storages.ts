import NativeFile from '@specs/NativeFile';

export const ROOT_STORAGE = NativeFile.getConstants().ExternalDirectoryPath;

/** Plugins stay app-private: they ship with the app, not with the library. */
export const PLUGIN_STORAGE = ROOT_STORAGE + '/Plugins';

/**
 * @deprecated Novel downloads moved to the user-picked SAF tree.
 *
 * The value is unchanged (and intentionally so) while importers get rewired:
 * use `src/utils/DownloadPaths.ts` for tree-relative download paths and
 * `src/services/saf` for the file operations themselves. Kept only as a
 * fallback for content that has not been migrated into the tree yet.
 */
export const NOVEL_STORAGE = ROOT_STORAGE + '/Novels';

/**
 * Shared storage root the device hands out (`/storage/emulated/0`), or an empty
 * string when the native module could not report one — direct storage then has
 * nowhere to write and stays unusable rather than writing somewhere guessed.
 */
const STORAGE_ROOT = NativeFile.getConstants().StoragePath ?? '';

/**
 * Mihon-style download folder, visible to any file manager and outside the app
 * data backup: `{STORAGE_ROOT}/SoraReader`. Only reachable once the user grants
 * all-files access; empty when the root is unknown.
 */
export const SHARED_ROOT = STORAGE_ROOT ? `${STORAGE_ROOT}/SoraReader` : '';

/** Root of the download layout inside [SHARED_ROOT] — what the server serves. */
export const SHARED_NOVELS = SHARED_ROOT ? `${SHARED_ROOT}/Novels` : '';
