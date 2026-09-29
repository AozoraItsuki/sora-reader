import NativeLocalServer from '@specs/NativeLocalServer';
import { SHARED_NOVELS } from '@utils/Storages';

/**
 * Point the local HTTP server at the shared download root.
 *
 * Direct-only: the SAF-tree path is deleted, so the tree uri is always
 * cleared and exactly one root (the shared one) is ever set — a mode
 * switch cannot leave a previous root behind on the native side.
 */
export const syncSafTreeUriToServer = (): void => {
  try {
    NativeLocalServer.setDownloadRoot(SHARED_NOVELS);
  } catch (error) {
    console.warn(
      '[saf] Could not hand the download root to the local server',
      error,
    );
  }
};
