import {
  isSafReady,
  probeDirectStorage,
  safExists,
  safReadFile,
} from '@services/saf/safFile';
import NativeFile from '@specs/NativeFile';
import {
  chapterRel,
  isAbsoluteUri,
  legacyDownloadPath,
} from '@utils/DownloadPaths';

/** Only image-looking assets are worth resolving and dropping. */
const IMAGE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/i;

const IMG_TAG_REGEX = /<img\b[^>]*>/gi;

const SRC_ATTR_REGEX = /\bsrc\s*=\s*["']([^"']*)["']/i;

/**
 * `true` when the download tree is readable right now.
 *
 * The cached flag alone is not enough: a read that runs before the boot-time
 * permission probe settles would skip the tree, miss the legacy location too and
 * fall through to a source fetch that fails with no network. Re-probing is
 * cheap (a synchronous native call) and self-heals the flag.
 */
const downloadTreeIsReadable = (): boolean =>
  isSafReady() || probeDirectStorage();

/** Every `src` referenced by an `<img>` tag, in document order. */
const collectImageSources = (html: string): string[] => {
  const sources: string[] = [];
  for (const tag of html.matchAll(IMG_TAG_REGEX)) {
    const src = SRC_ATTR_REGEX.exec(tag[0])?.[1];
    if (src) {
      sources.push(src);
    }
  }
  return sources;
};

/**
 * Tree-relative location of an image referenced by a chapter, or `null` when
 * the reference is not a chapter-local asset (remote URL, data URI, or an
 * absolute path outside this chapter) and must therefore be left alone.
 */
const chapterImageRel = (
  src: string,
  pluginId: string,
  novelId: number,
  chapterId: number,
): string | null => {
  const bare = src.split(/[?#]/)[0];
  if (!bare) {
    return null;
  }

  const chapterDir = chapterRel(pluginId, novelId, chapterId);

  if (isAbsoluteUri(bare)) {
    // Legacy `file://.../<chapterDir>/<name>` form: keep only what lives inside
    // this chapter, everything else is handled elsewhere.
    const legacyDir = `${legacyDownloadPath(chapterDir)}/`;
    const at = bare.lastIndexOf(legacyDir);
    if (at < 0) {
      return null;
    }
    const name = bare.slice(at + legacyDir.length);
    return name && IMAGE_EXT_REGEX.test(name) ? `${chapterDir}/${name}` : null;
  }

  if (!IMAGE_EXT_REGEX.test(bare)) {
    return null;
  }
  return bare.startsWith('Novels/') ? bare : `${chapterDir}/${bare}`;
};

/** `true` when a tree-relative download asset is present in the SAF tree. */
const chapterAssetExists = async (relativePath: string): Promise<boolean> => {
  if (downloadTreeIsReadable()) {
    try {
      if (await safExists(relativePath)) {
        return true;
      }
    } catch {
      // Fall through to the legacy location.
    }
  }
  return NativeFile.exists(legacyDownloadPath(relativePath));
};

/** Read a downloaded chapter's `index.html`, or `null` when not downloaded. */
export const readDownloadedChapterHtml = async (
  relativePath: string,
): Promise<string | null> => {
  if (downloadTreeIsReadable()) {
    try {
      return await safReadFile(relativePath);
    } catch {
      // Fall through to the legacy location.
    }
  }
  const legacyPath = legacyDownloadPath(relativePath);
  return NativeFile.exists(legacyPath) ? NativeFile.readFile(legacyPath) : null;
};

/**
 * Drop every image the exporter cannot embed.
 *
 * Images are rewritten to bare names when a chapter is downloaded, so they
 * have to be resolved against the chapter directory before we can tell whether
 * the export can actually embed them.
 */
export const dropMissingChapterImages = async (
  html: string,
  pluginId: string,
  novelId: number,
  chapterId: number,
): Promise<string> => {
  let content = html;

  for (const src of collectImageSources(content)) {
    const assetRel = chapterImageRel(src, pluginId, novelId, chapterId);
    if (!assetRel || (await chapterAssetExists(assetRel))) {
      continue;
    }

    const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(
      new RegExp(
        `<figure[^>]*>[\\s\\S]*?${escapedSrc}[\\s\\S]*?</figure>`,
        'g',
      ),
      '',
    );
    content = content.replace(
      new RegExp(`<img\\b[^>]*${escapedSrc}[^>]*\\/?>`, 'g'),
      '',
    );
  }

  return content;
};
