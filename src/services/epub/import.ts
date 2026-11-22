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

/** One imported asset and the flattened name it is written under. */
type AssetEntry = {
  /** Scratch-space path the bytes are read from. */
  source: string;
  /** Collision-free filename written next to `index.html`. */
  destination: string;
  /** Forward-slash, EPUB-relative path used to disambiguate same-name files. */
  key: string;
  basename: string;
};

type AssetRegistry = Map<string, AssetEntry[]>;

const normalizeSlashes = (path: string): string => path.replace(/\\/g, '/');
const stripLeadingSlashes = (path: string): string => path.replace(/^\/+/, '');

/**
 * Short stable digest of a source path (FNV-1a). Only used for assets whose
 * basename collides, so ordinary EPUBs keep readable bare filenames.
 */
const sourceHash = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/** Keep only a benign extension from the original name for hashed assets. */
const safeExtension = (basename: string): string => {
  const match = /\.([a-z0-9]{1,8})$/i.exec(basename);
  return match ? `.${match[1].toLowerCase()}` : '';
};

/**
 * Index every imported asset by basename. A unique basename keeps its name —
 * the reader anchors bare references to the chapter folder, and that is what
 * existing imports look like. When two sources share a basename, both get a
 * digest derived from their source-relative path so neither can overwrite the
 * other.
 */
const buildAssetRegistry = (
  sources: string[],
  epubDirPath: string,
): AssetRegistry => {
  const root = normalizeSlashes(epubDirPath).replace(/\/+$/, '');
  const registry: AssetRegistry = new Map();
  for (const source of Array.from(new Set(sources))) {
    const normalized = normalizeSlashes(source);
    const key = normalized.startsWith(`${root}/`)
      ? normalized.slice(root.length + 1)
      : stripLeadingSlashes(normalized);
    const basename = pathBasename(source);
    const list = registry.get(basename) ?? [];
    list.push({ source, key, basename, destination: '' });
    registry.set(basename, list);
  }

  const used = new Set<string>();
  const claim = (preferred: string): string => {
    let name = preferred;
    let suffix = 2;
    while (used.has(name)) {
      const dot = preferred.lastIndexOf('.');
      name =
        dot > 0
          ? `${preferred.slice(0, dot)}-${suffix++}${preferred.slice(dot)}`
          : `${preferred}-${suffix++}`;
    }
    used.add(name);
    return name;
  };

  // Readable names first: a generated digest can never steal a basename that
  // belongs to a different, non-colliding asset.
  for (const entries of registry.values()) {
    if (entries.length === 1) {
      entries[0].destination = claim(entries[0].basename);
    }
  }
  for (const [basename, entries] of registry) {
    if (entries.length > 1) {
      for (const entry of entries) {
        entry.destination = claim(
          `${sourceHash(entry.key)}${safeExtension(basename)}`,
        );
      }
    }
  }
  return registry;
};

/**
 * Resolve a `src`/`href` to the asset it names, or null when it must be left as
 * it is. A reference that already carries a scheme is somebody else's file (a
 * remote image, an inlined `data:` payload) and never lives in the EPUB; a
 * comma means the reference is a payload rather than a path, which keeps the
 * `srcset` candidate split from mangling `data:` images.
 *
 * Only references whose file is actually imported resolve. An EPUB internal
 * link such as `<a href="../Text/ch2.xhtml">` is not an image/style asset and
 * is left alone; collapsing it to a basename would point at a file that was
 * never copied next to `index.html`.
 */
const resolveAssetRef = (
  registry: AssetRegistry,
  ref: string,
): AssetEntry | null => {
  const path = ref.split(/[?#]/)[0];
  if (!path || hasScheme(path) || path.includes(',')) {
    return null;
  }
  const refPath = normalizeSlashes(path);
  const candidates = registry.get(pathBasename(refPath));
  if (!candidates?.length) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  // Same-name assets: prefer the source whose path ends with the ref path,
  // e.g. `../images/logo.png` -> `OEBPS/images/logo.png`. Sorting keeps the
  // fallback deterministic when a bare ref carries no directory information.
  const tail = stripLeadingSlashes(refPath).replace(/^(?:\.\.\/|\.\/)+/, '');
  const matches = candidates.filter(
    entry => entry.key === tail || entry.key.endsWith(`/${tail}`),
  );
  return [...(matches.length ? matches : candidates)].sort((a, b) =>
    a.key.localeCompare(b.key),
  )[0];
};

/**
 * Reduce a chapter's asset references to their flattened destination names and
 * report the sources that have to be copied next to `index.html`.
 */
const rewriteAssetRefs = (
  html: string,
  resolve: (ref: string) => AssetEntry | null,
): { html: string; assets: Map<string, string> } => {
  const assets = new Map<string, string>();
  const rewriteValue = (value: string, attribute: string): string => {
    // `srcset` holds a comma-separated candidate list of `url descriptor`.
    const candidates = attribute === 'srcset' ? value.split(',') : [value];
    const rewritten = candidates.map(candidate => {
      const url = candidate.trimStart().split(/\s/)[0] ?? '';
      const entry = resolve(url);
      if (!entry) {
        return candidate;
      }
      assets.set(entry.destination, entry.source);
      return candidate.replace(url, () => entry.destination);
    });
    return rewritten.join(',');
  };

  return {
    html: html.replace(
      ASSET_REF,
      (_, lead: string, attribute: string, eq: string, quote: string, value: string) =>
        `${lead}${attribute}${eq}${quote}${rewriteValue(value, attribute.toLowerCase())}${quote}`,
    ),
    assets,
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
    const assetRegistry = buildAssetRegistry(
      [
        ...novel.imagePaths,
        ...novel.cssPaths,
        ...(novel.cover ? [novel.cover] : []),
      ],
      epubDirPath,
    );

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
      const rewritten = rewriteAssetRefs(chapterText, ref =>
        resolveAssetRef(assetRegistry, ref),
      );
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

      for (const [destination, source] of rewritten.assets) {
        await importAssetIntoTree(source, `${chapterRelDir}/${destination}`);
      }
    }
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
  }));
};
