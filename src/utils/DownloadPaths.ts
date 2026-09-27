/**
 * Download path helpers.
 *
 * Every builder returns a path RELATIVE to the root of the SAF download tree,
 * using the same layout the app-private storage used, e.g.
 * `Novels/{pluginId}/{novelId}/{chapterId}/index.html`.
 *
 * Build them with these helpers instead of concatenating paths, so the SAF
 * migration only has to be understood in one place.
 */
import { getLocalServerUrl } from '@plugins/local/localServerManager';
import { NOVEL_STORAGE } from '@utils/Storages';

/** Root segment of the download layout inside the download tree. */
export const NOVELS_ROOT = 'Novels';

type Id = string | number;

const join = (...segments: Id[]): string => segments.join('/');

/** `Novels/{pluginId}/{novelId}` */
export const novelDirRel = (pluginId: Id, novelId: Id): string =>
  join(NOVELS_ROOT, pluginId, novelId);

/** `Novels/{pluginId}/{novelId}/{chapterId}` */
export const chapterRel = (
  pluginId: Id,
  novelId: Id,
  chapterId: Id,
): string => join(novelDirRel(pluginId, novelId), chapterId);

/** `Novels/{pluginId}/{novelId}/{chapterId}/index.html` */
export const chapterIndexRel = (
  pluginId: Id,
  novelId: Id,
  chapterId: Id,
): string => join(chapterRel(pluginId, novelId, chapterId), 'index.html');

/**
 * `Novels/{pluginId}/{novelId}/{chapterId}/{imageIndex}.b64.png`
 *
 * `imageIndex` is the ordinal the downloader stamped onto the rewritten
 * `<img src>`, which the reader resolves against the chapter base url.
 */
export const chapterImageRel = (
  pluginId: Id,
  novelId: Id,
  chapterId: Id,
  imageIndex: Id,
): string =>
  join(chapterRel(pluginId, novelId, chapterId), `${imageIndex}.b64.png`);

/** `Novels/{pluginId}/{novelId}/cover.png` */
export const coverRel = (pluginId: Id, novelId: Id): string =>
  join(novelDirRel(pluginId, novelId), 'cover.png');

/** `Novels/{pluginId}/{novelId}/{chapterId}/.nomedia` */
export const nomediaRel = (
  pluginId: Id,
  novelId: Id,
  chapterId: Id,
): string => join(chapterRel(pluginId, novelId, chapterId), '.nomedia');

/**
 * Turn a download path into something an `<Image>` (or the WebView) can load.
 *
 * - Relative tree paths (`Novels/...`) are served by the local HTTP server, so
 *   they are resolved against its base URL.
 * - Absolute values (`http(s)://`, `file://`, `data:`, `content://`, plain
 *   absolute paths) are passed through untouched: most novel covers are remote
 *   urls and must not be rewritten.
 * - While the server is still starting, relative paths are returned as-is so a
 *   later render can retry instead of baking in a broken host.
 */
export const resolveDownloadUrl = (
  relPath?: string | null,
): string | undefined => {
  if (!relPath) {
    return undefined;
  }
  if (isAbsoluteUri(relPath)) {
    return relPath;
  }
  const baseUrl = getLocalServerUrl();
  if (!baseUrl) {
    return relPath;
  }
  return `${baseUrl.replace(/\/+$/, '')}/${relPath.replace(/^\/+/, '')}`;
};

/** `true` when a value already addresses something without a base URL. */
export const isAbsoluteUri = (value: string): boolean =>
  /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(value);

/**
 * The pre-SAF, app-private location of a tree-relative download path.
 *
 * Used only as a read fallback so installs that have not picked a download
 * folder yet (or whose migration has not run) keep resolving their downloads.
 */
export const legacyDownloadPath = (relativePath: string): string => {
  const clean = relativePath.replace(/^\/+/, '');
  if (clean === NOVELS_ROOT || clean === '') {
    return NOVEL_STORAGE;
  }
  const withoutNovels = clean.startsWith(`${NOVELS_ROOT}/`)
    ? clean.slice(NOVELS_ROOT.length + 1)
    : clean;
  return `${NOVEL_STORAGE}/${withoutNovels}`;
};
