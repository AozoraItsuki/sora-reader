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
