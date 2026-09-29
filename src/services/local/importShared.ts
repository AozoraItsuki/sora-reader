/**
 * Shared local-file import plumbing for the EPUB and PDF importers.
 *
 * Both formats land in the same place: a novel row, a cover at
 * `Novels/{pluginId}/{novelId}/cover.png`, and one chapter folder per reading
 * unit holding an `index.html` plus the assets that document references by
 * bare filename. Only the bytes differ, so everything but the bytes lives here.
 */
import { dbManager } from '@database/db';
import {
  updateNovelCategoryById,
  updateNovelInfo,
} from '@database/queries/NovelQueries';
import { chapterSchema, novelSchema } from '@database/schema';
import { LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import { safMkdir, safWriteFile } from '@services/saf/safFile';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import { chapterRel, coverRel, novelDirRel } from '@utils/DownloadPaths';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';

/** Row returned by the chapter batch insert, for the Phase 2 file I/O pass. */
export type InsertedChapter = {
  insertId: number;
  fakeId: number;
  sourcePath: string;
};

export type LocalNovelInput = {
  name: string;
  path: string;
  cover?: string;
  author?: string;
  artist?: string;
  summary?: string;
};

/** Decode a `%`-escaped path, leaving it untouched when it is not escaped. */
export const decodePath = (path: string) => {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

/** Last path segment of a path, for tree-relative and absolute paths alike. */
export const pathBasename = (filePath: string): string =>
  filePath.split(/[/\\]/).pop() || filePath;

/**
 * expo-file-system only addresses `file://` URIs: handing it a bare absolute
 * path throws "Unsupported scheme". [NativeFile] is the opposite — it wraps
 * `java.io.File` and needs the path bare — so the prefix is added for the expo
 * read alone and never leaks into the existence probe or the destination.
 */
const fileUri = (absPath: string): string =>
  absPath.startsWith('file://') ? absPath : `file://${absPath}`;

/**
 * Copy a scratch-space file into the download tree as base64.
 *
 * Extracted/rasterized assets live in app-private cache space; they are read
 * from there and re-written into the download tree. Returns false when the
 * source is gone, so a page whose render failed does not abort the whole import.
 */
export const importAssetIntoTree = async (
  sourcePath: string,
  destinationRel: string,
): Promise<boolean> => {
  const decodedPath = decodePath(sourcePath);
  if (!NativeFile.exists(decodedPath)) {
    return false;
  }
  const base64 = await readAsStringAsync(fileUri(decodedPath), {
    encoding: EncodingType.Base64,
  });
  await safWriteFile(destinationRel, base64, 'base64');
  return true;
};

/** Insert the novel row, its default category, and its cover. */
export const insertLocalNovel = async ({
  name,
  path,
  cover,
  author,
  artist,
  summary,
}: LocalNovelInput): Promise<number> => {
  const { insertId } = await dbManager.write(async tx => {
    return tx
      .insert(novelSchema)
      .values({
        name,
        path,
        pluginId: LOCAL_PLUGIN_ID,
        inLibrary: true,
        isLocal: true,
      })
      .run();
  });

  if (insertId !== undefined && insertId >= 0) {
    await updateNovelCategoryById(insertId, [2]);
    const novelRelDir = novelDirRel(LOCAL_PLUGIN_ID, insertId);
    await safMkdir(novelRelDir);
    let newCoverPath = '';

    if (cover) {
      // DB stores a TREE-RELATIVE cover path (no file:// prefix).
      newCoverPath = coverRel(LOCAL_PLUGIN_ID, insertId);
      await importAssetIntoTree(cover, newCoverPath);
    }
    await updateNovelInfo({
      id: insertId,
      pluginId: LOCAL_PLUGIN_ID,
      author: author,
      artist: artist,
      summary: summary,
      path: novelRelDir,
      cover: newCoverPath,
      name: name,
      inLibrary: true,
      isLocal: true,
      totalPages: 0,
    });
    return insertId;
  }
  throw new Error(getString('advancedSettingsScreen.novelInsertFailed'));
};

/**
 * Insert every chapter in a single transaction.
 *
 * Returns an array of { insertId, fakeId, sourcePath } for the Phase 2 file I/O
 * pass, which has to run outside the transaction.
 */
export const batchInsertChapters = async (
  novelId: number,
  chapters: { name: string; path: string }[],
  releaseTime: string,
): Promise<InsertedChapter[]> => {
  return await dbManager.write(async tx => {
    const results: InsertedChapter[] = [];

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const { insertId } = await tx
        .insert(chapterSchema)
        .values({
          novelId,
          name: chapter.name,
          path: chapterRel(LOCAL_PLUGIN_ID, novelId, i),
          releaseTime,
          position: i,
          isDownloaded: true,
        })
        .run();

      if (insertId !== undefined && insertId >= 0) {
        results.push({
          insertId,
          fakeId: i,
          sourcePath: chapter.path,
        });
      }
    }

    return results;
  });
};
