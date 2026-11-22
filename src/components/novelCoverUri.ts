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
import { getUserAgent } from '@hooks/persisted/useUserAgent';
import { defaultCover } from '@plugins/helpers/constants';
import type { ImageRequestInit } from '@plugins/types';
import { getDirectRootAbsolute } from '@services/saf/safFile';
import NativeFile from '@specs/NativeFile';
import {
  coverRel,
  isAbsoluteUri,
  resolveDownloadUrl,
} from '@utils/DownloadPaths';
import { useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

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

/** RN `<Image>` source for a novel cover, plus the handler to attach to it. */
export interface NovelCoverImageSource {
  source: ImageSourcePropType;
  /** Drops a stale on-disk answer so a later render re-probes the filesystem. */
  onError?: () => void;
}

export interface NovelCoverImageOptions {
  /** Plugin request init; its headers win over the default User-Agent. */
  imageRequestInit?: ImageRequestInit;
  /** A local uri that already failed to load, so the fallback is used instead. */
  brokenLocalUri?: string | null;
}

export interface ResolvedNovelCover extends NovelCoverImageSource {
  /** The on-disk uri actually used, or null when a fallback was chosen. */
  localUri: string | null;
}

const isRemoteHttpUri = (uri: string): boolean => /^https?:\/\//i.test(uri);

/**
 * Synchronous, disk-first cover resolution shared by every cover thumbnail.
 *
 * A tree-relative cover is not an Image uri: while the local server is down
 * `resolveDownloadUrl` returns it unchanged, which produced blank covers. Only
 * an absolute served/remote url is accepted — otherwise the placeholder wins.
 */
export const novelCoverImageSource = (
  cover: string | null | undefined,
  source: LocalCoverSource | null,
  options: NovelCoverImageOptions = {},
): ResolvedNovelCover => {
  const localUri = localCoverFileUri(cover, source);
  const useLocal = localUri !== null && localUri !== options.brokenLocalUri;
  const servedUri = resolveDownloadUrl(cover);
  const uri = useLocal
    ? localUri
    : servedUri && isAbsoluteUri(servedUri)
    ? servedUri
    : defaultCover;
  const headers =
    options.imageRequestInit?.headers ??
    (isRemoteHttpUri(uri) ? { 'User-Agent': getUserAgent() } : undefined);
  return {
    source: { uri, ...(headers ? { headers } : {}) },
    localUri: useLocal ? localUri : null,
    onError: useLocal ? () => invalidateLocalCoverUri(source) : undefined,
  };
};

/**
 * Hook wrapper: after a bad local file, retry with the served/remote fallback.
 * The retry flag is plain React state, so first paint is never delayed.
 */
export const useNovelCoverImageSource = (
  cover: string | null | undefined,
  source: LocalCoverSource | null,
  imageRequestInit?: ImageRequestInit,
): NovelCoverImageSource => {
  const [brokenLocalUri, setBrokenLocalUri] = useState<string | null>(null);
  const pluginId = source?.pluginId;
  const novelId = source?.novelId;
  const resolved = useMemo(
    () =>
      novelCoverImageSource(
        cover,
        pluginId && novelId !== undefined ? { pluginId, novelId } : null,
        { imageRequestInit, brokenLocalUri },
      ),
    [cover, pluginId, novelId, imageRequestInit, brokenLocalUri],
  );
  const onError = resolved.onError
    ? () => {
        resolved.onError?.();
        setBrokenLocalUri(resolved.localUri);
      }
    : undefined;
  return { source: resolved.source, onError };
};
