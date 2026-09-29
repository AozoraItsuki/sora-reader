/**
 * Orphan-download classifier.
 *
 * A `Novels/{pluginId}/{novelId}/` directory is an orphan only when it holds
 * no downloaded chapters AND its novel has no database row. Anything else is
 * kept: a novel the user downloaded but removed from the library must never
 * be deleted, and a directory we cannot identify (non-numeric name) is never
 * touched.
 */

import { getNovelById } from '@database/queries/NovelQueries';
import NativeFile from '@specs/NativeFile';
import { SHARED_NOVELS } from '@utils/Storages';

export type OrphanVerdict = 'keep' | 'orphan';

export interface OrphanDirInput {
  /** Numeric novel id parsed from the directory name, or null if unparseable. */
  readonly novelId: number | null;
  /** True when at least one `index.html` exists anywhere under the directory. */
  readonly hasChapterIndex: boolean;
  /** True when the novel still has a database row. */
  readonly inDb: boolean;
}

export const classifyDownloadDir = (input: OrphanDirInput): OrphanVerdict => {
  if (input.novelId === null || input.inDb || input.hasChapterIndex) {
    return 'keep';
  }
  return 'orphan';
};

export interface OrphanEntry {
  /** Absolute path of the orphaned `Novels/{pluginId}/{novelId}/` directory. */
  readonly path: string;
  /** Recursive size in bytes, for display before a confirmed delete. */
  readonly bytes: number;
}

const CHAPTER_INDEX = 'index.html';

const readChildren = (dir: string) => {
  try {
    return NativeFile.readDir(dir) ?? [];
  } catch {
    return [];
  }
};

const dirHasChapterIndex = (novelPath: string): boolean =>
  readChildren(novelPath).some(child => {
    if (!child.isDirectory) {
      return false;
    }
    try {
      return NativeFile.exists(`${child.path}/${CHAPTER_INDEX}`);
    } catch {
      return false;
    }
  });

/**
 * Walk the shared `Novels/{pluginId}/{novelId}/` tree and return every
 * directory the classifier flags as orphan. Synchronous: every filesystem
 * call underneath is a sync native call, matching the existing storage-info
 * pattern in the settings screen.
 */
export const scanOrphanDownloads = (): readonly OrphanEntry[] => {
  const found: OrphanEntry[] = [];
  try {
    if (!NativeFile.exists(SHARED_NOVELS)) {
      return found;
    }
    for (const plugin of readChildren(SHARED_NOVELS)) {
      if (!plugin.isDirectory) {
        continue;
      }
      for (const novel of readChildren(plugin.path)) {
        if (!novel.isDirectory) {
          continue;
        }
        const parsed = Number(novel.name);
        const numeric = novel.name !== '' && Number.isInteger(parsed);
        const verdict = classifyDownloadDir({
          novelId: numeric ? parsed : null,
          hasChapterIndex: dirHasChapterIndex(novel.path),
          inDb: numeric && getNovelById(parsed) !== undefined,
        });
        if (verdict === 'orphan') {
          found.push({
            path: novel.path,
            bytes: NativeFile.getFileSize(novel.path),
          });
        }
      }
    }
  } catch {
    return found;
  }
  return found;
};
