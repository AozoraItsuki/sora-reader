/**
 * Local cover resolution.
 *
 * In direct-storage mode the local HTTP server has nothing to serve a cover
 * from until it is told where the download root is, and a stale/broken `cover`
 * column leaves the library with the placeholder even though the file sits
 * right there under the shared download root. So the file on disk wins, and the
 * caller keeps the server/remote url as the fallback.
 *
 * Kept out of `NovelCover.tsx` so the path logic can be tested without pulling
 * in the component's theme, list and navigation dependencies.
 */
import { getDirectRootAbsolute } from '@services/saf/safFile';
import NativeFile from '@specs/NativeFile';
import { coverRel, isAbsoluteUri } from '@utils/DownloadPaths';

/** The novel identity a downloaded cover is filed under. */
export interface LocalCoverSource {
  pluginId: string;
  novelId: number;
}

/** `true` when the value is a tree-relative download path we could resolve. */
const isTreeRelative = (value: string): boolean =>
  value.length > 0 && !isAbsoluteUri(value);

/**
 * Candidate tree-relative paths for a cover, most specific first.
 *
 * The stored `cover` is authoritative when it is a relative download path. A
 * remote or already-absolute value tells us nothing about the local layout, so
 * the conventional `cover.png` location is tried instead — that is the file the
 * downloader writes, and it exists even when the cover column went stale.
 */
export const localCoverCandidates = (
  cover: string | null | undefined,
  source: LocalCoverSource | null,
): string[] => {
  const candidates: string[] = [];
  if (cover && isTreeRelative(cover)) {
    candidates.push(cover);
  }
  if (source) {
    candidates.push(coverRel(source.pluginId, source.novelId));
  }
  return candidates;
};

/** expo and `java.io.File` disagree on prefixes; the UI wants exactly one. */
const toFileUri = (absPath: string): string =>
  absPath.startsWith('file://') ? absPath : `file://${absPath}`;

/**
 * Cached resolutions of `localCoverFileUri`, including misses — a list row can
 * re-render many times, and every probe used to be a synchronous native
 * `exists` call.
 *
 * Lifetime: process-lifetime, bounded by COVER_URI_CACHE_LIMIT with LRU
 * eviction. There is no existing exported cover download/removal hook in the
 * modules this file may call, so nothing invalidates on those events; callers
 * that do have one can use the two exported helpers below. NovelCover evicts a
 * novel's entries when its local image fails to load. The download root is part
 * of the key, so switching direct-storage roots never reuses a stale answer.
 */
const COVER_URI_CACHE_LIMIT = 512;
const coverUriCache = new Map<string, string | null>();

const coverCacheKey = (
  root: string,
  cover: string | null | undefined,
  source: LocalCoverSource | null,
): string =>
  [source?.pluginId ?? '', source?.novelId ?? '', cover ?? '', root].join(
    '\u0000',
  );

/** Drop every cached resolution, e.g. after a storage migration. */
export const clearLocalCoverUriCache = (): void => {
  coverUriCache.clear();
};

/** Drop cached resolutions for one novel after its cover is written or removed. */
export const invalidateLocalCoverUri = (
  source: LocalCoverSource | null,
): void => {
  if (!source) {
    return;
  }
  const prefix = `${source.pluginId}\u0000${source.novelId}\u0000`;
  for (const key of coverUriCache.keys()) {
    if (key.startsWith(prefix)) {
      coverUriCache.delete(key);
    }
  }
};

const resolveLocalCoverFileUri = (
  root: string,
  cover: string | null | undefined,
  source: LocalCoverSource | null,
): string | null => {
  for (const candidate of localCoverCandidates(cover, source)) {
    const absPath = `${root}/${candidate.replace(/^\/+/, '')}`;
    if (NativeFile.exists(absPath)) {
      return toFileUri(absPath);
    }
  }
  return null;
};

/**
 * `file://` uri of the cover on disk, or `null` when there is none to load.
 *
 * Returns null — rather than a path that may not exist — whenever the direct
 * backend is unusable, so tree mode keeps resolving covers through the local
 * server exactly as before.
 */
export const localCoverFileUri = (
  cover: string | null | undefined,
  source: LocalCoverSource | null,
): string | null => {
  const root = getDirectRootAbsolute();
  if (!root) {
    return null;
  }
  const key = coverCacheKey(root, cover, source);
  const cached = coverUriCache.get(key);
  if (cached !== undefined) {
    // Refresh the LRU position without touching the filesystem.
    coverUriCache.delete(key);
    coverUriCache.set(key, cached);
    return cached;
  }
  const uri = resolveLocalCoverFileUri(root, cover, source);
  coverUriCache.set(key, uri);
  if (coverUriCache.size > COVER_URI_CACHE_LIMIT) {
    const oldest = coverUriCache.keys().next().value;
    if (oldest !== undefined) {
      coverUriCache.delete(oldest);
    }
  }
  return uri;
};
