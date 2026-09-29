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
  for (const candidate of localCoverCandidates(cover, source)) {
    const absPath = `${root}/${candidate.replace(/^\/+/, '')}`;
    if (NativeFile.exists(absPath)) {
      return toFileUri(absPath);
    }
  }
  return null;
};
