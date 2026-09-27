/**
 * Reading the app-private legacy download tree.
 *
 * Layout, three levels deep before a file:
 *   {oldRoot}/{pluginId}/{novelId}/cover.png
 *   {oldRoot}/{pluginId}/{novelId}/{chapterId}/index.html
 *
 * Every native call here is best-effort: a throw must never abort the migration
 * that drives it, so a failed read degrades to "nothing found there".
 */
import NativeFile from '@specs/NativeFile';

export type LegacyEntry = { name: string; path: string; isDirectory: boolean };

/**
 * Where a chapter's files sit now, and where they have to land in the tree.
 *
 * They differ when a plugin was renamed: the files keep living under the old
 * folder, but the reader will only look under the new one.
 */
export type LegacyChapterRef = {
  fromPluginId: string;
  toPluginId: string;
  novelId: number;
  chapterId: number;
};

export const nativeFileExists = (path: string): boolean => {
  try {
    return NativeFile.exists(path);
  } catch {
    return false;
  }
};

export const nativeFileReadFile = (path: string): string | null => {
  try {
    return NativeFile.readFile(path) ?? null;
  } catch {
    return null;
  }
};

export const nativeFileReadDir = (dirPath: string): LegacyEntry[] => {
  try {
    return NativeFile.readDir(dirPath) ?? [];
  } catch {
    return [];
  }
};

export const nativeFileUnlink = (path: string) => {
  try {
    NativeFile.unlink(path);
  } catch {
    // Best effort — the legacy root is removed wholesale at the end anyway.
  }
};

/**
 * A folder name that addresses a row id, e.g. `12`. Anything else cannot name a
 * chapter in the tree, so the migration must not claim the files inside it.
 */
export const asRowId = (name: string): number | null => {
  if (!/^\d+$/.test(name)) {
    return null;
  }
  const id = Number(name);
  return Number.isSafeInteger(id) ? id : null;
};

/** True when `dirPath` is a chapter folder, i.e. it holds an `index.html`. */
const holdsChapterHtml = (dirPath: string): boolean =>
  nativeFileReadDir(dirPath).some(
    entry => !entry.isDirectory && entry.name === 'index.html',
  );

/**
 * Every chapter folder still standing in the legacy tree.
 *
 * A chapter whose novel row was deleted — or whose plugin was renamed — cannot be
 * reached through the DB at all, so the tree is the only record that it exists.
 * Folders the walk cannot address (a name that is not a row id, a directory
 * with no `index.html`) are left out: they are not chapters this app wrote, and
 * the migration must not move files it cannot identify.
 */
export const collectLegacyChapterRefs = (
  oldRoot: string,
): LegacyChapterRef[] => {
  const refs: LegacyChapterRef[] = [];
  for (const pluginDir of nativeFileReadDir(oldRoot)) {
    if (!pluginDir.isDirectory) {
      continue;
    }
    for (const novelDir of nativeFileReadDir(pluginDir.path)) {
      if (!novelDir.isDirectory) {
        continue;
      }
      const novelId = asRowId(novelDir.name);
      if (novelId === null) {
        continue;
      }
      for (const chapterDir of nativeFileReadDir(novelDir.path)) {
        const chapterId = chapterDir.isDirectory
          ? asRowId(chapterDir.name)
          : null;
        if (chapterId === null || !holdsChapterHtml(chapterDir.path)) {
          continue;
        }
        refs.push({
          fromPluginId: pluginDir.name,
          toPluginId: pluginDir.name,
          novelId,
          chapterId,
        });
      }
    }
  }
  return refs;
};
