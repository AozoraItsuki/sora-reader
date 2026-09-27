import { dbManager } from '@database/db';
import {
  updateNovelCategoryById,
  updateNovelInfo,
} from '@database/queries/NovelQueries';
import { chapterSchema, novelSchema } from '@database/schema';
import { LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import {
  safMkdir,
  safWriteFile,
} from '@services/saf/safFile';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import NativeEpub from '@specs/NativeEpub';
import NativeFile from '@specs/NativeFile';
import NativeZipArchive from '@specs/NativeZipArchive';
import { getString } from '@strings/translations';
import {
  chapterIndexRel,
  chapterRel,
  coverRel,
  novelDirRel,
} from '@utils/DownloadPaths';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import dayjs from 'dayjs';

const decodePath = (path: string) => {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

/**
 * The extracted epub lives in app-private cache scratch space; assets are read
 * from there and re-written into the SAF tree.
 */
const importAssetIntoTree = async (
  sourcePath: string,
  destinationRel: string,
): Promise<boolean> => {
  const decodedPath = decodePath(sourcePath);
  if (!NativeFile.exists(decodedPath)) {
    return false;
  }
  const base64 = await readAsStringAsync(decodedPath, {
    encoding: EncodingType.Base64,
  });
  await safWriteFile(destinationRel, base64, 'base64');
  return true;
};

/**
 * Basenames a rewritten chapter document points at.
 *
 * The rewrite below reduces every `src`/`href` to its last path segment, so
 * these are the only names a chapter can reference.
 */
const referencedAssets = (html: string): string[] => {
  const names = new Set<string>();
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const name = match[1].split(/[/\\]/).pop();
    if (name) {
      names.add(name);
    }
  }
  return Array.from(names);
};

/** Last path segment of an extracted-epub asset path. */
const assetName = (filePath: string): string =>
  filePath.split(/[/\\]/).pop() || filePath;

const insertLocalNovel = async (
  name: string,
  path: string,
  cover?: string,
  author?: string,
  artist?: string,
  summary?: string,
) => {
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
 * Phase 1: Batch insert all chapters in a single transaction.
 * Returns an array of { insertId, fakeId, sourcePath } for Phase 2 file I/O.
 */
const batchInsertChapters = async (
  novelId: number,
  chapters: { name: string; path: string }[],
  releaseTime: string,
): Promise<{ insertId: number; fakeId: number; sourcePath: string }[]> => {
  return await dbManager.write(async tx => {
    const results: { insertId: number; fakeId: number; sourcePath: string }[] =
      [];

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

export const importEpub = async (
  {
    uri,
    filename,
  }: {
    uri: string;
    filename: string;
  },
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
    progress: 0,
  }));

  const epubFilePath =
    NativeFile.getConstants().ExternalCachesDirectoryPath + '/novel.epub';
  try {
    NativeFile.copyFile(uri, epubFilePath);
  } catch {
    throw new Error(
      `Failed to read EPUB file "${filename}". The file may have been moved or deleted. Please try importing again.`,
    );
  }
  const epubDirPath =
    NativeFile.getConstants().ExternalCachesDirectoryPath + '/epub';
  if (NativeFile.exists(epubDirPath)) {
    NativeFile.unlink(epubDirPath);
  }
  NativeFile.mkdir(epubDirPath);
  await NativeZipArchive.unzip(epubFilePath, epubDirPath);
  const novel = await NativeEpub.parseNovelAndChapters(epubDirPath);
  if (!novel.name) {
    novel.name = filename.replace('.epub', '') || 'Untitled';
  }
  const novelId = await insertLocalNovel(
    novel.name,
    epubDirPath + novel.name, // temporary
    novel.cover || '',
    novel.author || '',
    novel.artist || '',
    novel.summary || '',
  );
  const now = dayjs().toISOString();
  if (novel.chapters) {
    // Normalize chapter names before insert
    for (const chapter of novel.chapters) {
      if (!chapter.name) {
        chapter.name = chapter.path.split(/[/\\]/).pop() || 'unknown';
      }
    }

    setMeta(meta => ({
      ...meta,
      progressText: getString('common.preparing'),
    }));

    // Phase 1: Single transaction — batch insert all chapters
    const chapterResults = await batchInsertChapters(
      novelId,
      novel.chapters,
      now,
    );

    // Phase 2: File I/O outside the transaction
    //
    // Chapter documents reference their assets by bare filename, and
    // `LocalPlugin.resolveUrl` anchors those names to the chapter's own
    // directory on the local server. So every referenced asset has to be copied
    // into that chapter's folder next to index.html -- NOT hoisted into the
    // novel root, which is where the pre-SAF absolute `file://` refs pointed.
    const assetSources = new Map<string, string>();
    for (const filePath of [...novel.imagePaths, ...novel.cssPaths]) {
      assetSources.set(assetName(filePath), filePath);
    }
    if (novel.cover) {
      assetSources.set(assetName(novel.cover), novel.cover);
    }

    for (let i = 0; i < chapterResults.length; i++) {
      const result = chapterResults[i];

      setMeta(meta => ({
        ...meta,
        progressText: novel.chapters[result.fakeId]?.name ?? `Chapter ${i}`,
        progress: i / chapterResults.length,
      }));

      let chapterText = NativeFile.readFile(decodePath(result.sourcePath));
      if (!chapterText) continue;

      // RELATIVE srcs (bare filenames): the reader resolves them against the
      // local-server baseUrl, so the assets must sit next to index.html.
      chapterText = chapterText.replace(
        /[=](?<= href=| src=)(["'])([^]*?)\1/g,
        (_, __, $2: string) => {
          return `="${$2.split(/[/\\]/).pop()}"`;
        },
      );

      const chapterRelDir = chapterRel(LOCAL_PLUGIN_ID, novelId, result.insertId);
      await safMkdir(chapterRelDir);
      await safWriteFile(
        chapterIndexRel(LOCAL_PLUGIN_ID, novelId, result.insertId),
        chapterText,
      );

      for (const name of referencedAssets(chapterText)) {
        const source = assetSources.get(name);
        if (source) {
          await importAssetIntoTree(source, `${chapterRelDir}/${name}`);
        }
      }
    }
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
  }));
};
