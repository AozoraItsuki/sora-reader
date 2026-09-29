/**
 * Startup guarantee for the direct (all-files) download backend.
 *
 * The backend writes `{SHARED_ROOT}/Novels/...`, but nothing in the normal write
 * path creates the two roots themselves: `java.io.File.mkdir` is only ever
 * called with the deepest path a download needs, which silently does nothing
 * while an ancestor is missing. On a fresh install — or after the user clears
 * app data but keeps `/sdcard` — every download then fails on an absent folder.
 *
 * So the roots are created once at boot, best effort: a failure here costs the
 * user a retry at download time, never the app. It creates directories only and
 * asks for nothing, so it can never introduce a permission prompt.
 */
import DebugLogService from '@services/DebugLogService';
import NativeFile from '@specs/NativeFile';
import { SHARED_NOVELS, SHARED_ROOT } from '@utils/Storages';

const BTAG = '[Storage]';

/**
 * Directories to create, in creation order (parents first). Empty roots are
 * dropped rather than passed to `mkdir`: [SHARED_ROOT] is empty when the device
 * reported no storage root, and there is then nothing to create.
 */
export const dirsToCreate = (root: string, novels: string): string[] =>
  [root, novels].filter(dir => dir !== '');

/** The device's own roots, in creation order. */
export const sharedDirs = (): string[] =>
  dirsToCreate(SHARED_ROOT, SHARED_NOVELS);

/**
 * Create the shared download roots. Idempotent and never throws, so it is safe
 * to call unconditionally on the boot path.
 */
export const ensureSharedDirs = (): void => {
  try {
    for (const dir of sharedDirs()) {
      NativeFile.mkdir(dir);
    }
  } catch (error) {
    DebugLogService.addEntry(
      'warn',
      `${BTAG} Could not create the shared download folders: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};
