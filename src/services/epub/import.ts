import { LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import {
  batchInsertChapters,
  decodePath,
  importAssetIntoTree,
  insertLocalNovel,
  pathBasename,
} from '@services/local/importShared';
import { safMkdir, safWriteFile } from '@services/saf/safFile';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import NativeEpub from '@specs/NativeEpub';
import NativeFile from '@specs/NativeFile';
import NativeZipArchive from '@specs/NativeZipArchive';
import { getString } from '@strings/translations';
import { chapterIndexRel, chapterRel } from '@utils/DownloadPaths';
import dayjs from 'dayjs';

/**
 * A `src`/`href` value or a `srcset`/`data-src` reference, quoted.
 *
 * `srcset` and `data-src` are included because a chapter that only names an
 * image lazily (`<img src="placeholder.gif" data-src="hero.png">`) or through
 * a responsive candidate list still has to get that image next to its
 * `index.html`, or the reader resolves it against a file that is not there.
 */
const ASSET_REF = /(\s)(src|href|srcset|data-src)(\s*=\s*)(["'])([^]*?)\4/gi;

/** `true` when a reference already addresses something on its own. */
const hasScheme = (ref: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(ref);

/**
 * Filename an asset reference points at, or null when it must be left as it is.
 *
 * A reference that already carries a scheme is somebody else's file (a remote
 * image, an inlined `data:` payload) and never lives in the EPUB, so it is kept
 * verbatim instead of being pointed at a copy that does not exist. A comma means
 * the reference is a payload rather than a path, which keeps the `srcset`
 * candidate split from mangling `data:` images.
 */
const localAssetName = (ref: string): string | null => {
  // A query or fragment is not part of the name the asset is copied under.
  const path = ref.split(/[?#]/)[0];
  if (!path || hasScheme(path) || path.includes(',')) {
    return null;
  }
  return path.split(/[/\\]/).pop() || null;
};

/**
 * Reduce every asset reference of a chapter document to the bare filename it
 * points at, and report the filenames that is.
 *
 * Both come out of one walk, so a rewritten chapter can only reference names
 * that are also copied next to its `index.html`.
 */
const rewriteAssetRefs = (html: string): { html: string; names: string[] } => {
  const names = new Set<string>();
  const rewriteValue = (value: string, attribute: string): string => {
    // `srcset` holds a comma-separated candidate list of `url descriptor`.
    const candidates = attribute === 'srcset' ? value.split(',') : [value];
    const rewritten = candidates.map(candidate => {
      const url = candidate.trimStart().split(/\s/)[0] ?? '';
      const name = localAssetName(url);
      if (!name) {
        return candidate;
      }
      names.add(name);
      return candidate.replace(url, () => name);
    });
    return rewritten.join(',');
  };

  return {
    html: html.replace(
      ASSET_REF,
      (_, lead: string, attribute: string, eq: string, quote: string, value: string) =>
        `${lead}${attribute}${eq}${quote}${rewriteValue(value, attribute.toLowerCase())}${quote}`,
    ),
    names: Array.from(names),
  };
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
  const novelId = await insertLocalNovel({
    name: novel.name,
    // temporary
    path: epubDirPath + novel.name,
    cover: novel.cover || '',
    author: novel.author || '',
    artist: novel.artist || '',
    summary: novel.summary || '',
  });
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
      assetSources.set(pathBasename(filePath), filePath);
    }
    if (novel.cover) {
      assetSources.set(pathBasename(novel.cover), novel.cover);
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
      const rewritten = rewriteAssetRefs(chapterText);
      chapterText = rewritten.html;

      const chapterRelDir = chapterRel(
        LOCAL_PLUGIN_ID,
        novelId,
        result.insertId,
      );
      await safMkdir(chapterRelDir);
      await safWriteFile(
        chapterIndexRel(LOCAL_PLUGIN_ID, novelId, result.insertId),
        chapterText,
      );

      for (const name of rewritten.names) {
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
