import NativeLocalServer from '@specs/NativeLocalServer';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  clearSafFolder,
  ensureSafPermission,
  getSafTreeUri,
  isSafMigrationDone,
  markSafMigrationDone,
  pickDownloadFolder,
} from './safFile';

export interface UseSafLocationResult {
  /** Persisted tree uri, or null when no folder has been picked. */
  treeUri: string | null;
  /** The grant was re-taken and the tree is readable/writable. */
  ready: boolean;
  /** A permission probe finished at least once. */
  checked: boolean;
  /** A picker or permission call is in flight. */
  busy: boolean;
  /** Legacy app-private storage was already migrated into the tree. */
  migrationDone: boolean;
  /** Re-take the persisted grant; false means the user must re-pick. */
  ensure: () => Promise<boolean>;
  /** Open the folder picker. */
  pick: () => Promise<boolean>;
  /** Forget the current folder and release its grant. */
  clear: () => Promise<boolean>;
  markMigrationDone: () => void;
}

/**
 * Point the local HTTP server at the SAF tree, or at the legacy app-private
 * directory when no tree is configured. The server owns the request serving —
 * this only hands it the uri it should read from.
 */
export const syncSafTreeUriToServer = (): void => {
  try {
    NativeLocalServer.setSafTreeUri(getSafTreeUri() ?? '');
  } catch (error) {
    console.warn('[saf] Could not hand the tree uri to the local server', error);
  }
};

/**
 * Download-folder state: restores the persisted SAF grant on boot, and exposes
 * the pick/clear actions the settings screens need.
 */
export function useSafLocation(): UseSafLocationResult {
  const [treeUri, setTreeUri] = useState<string | null>(getSafTreeUri);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [migrationDone, setMigrationDone] = useState(isSafMigrationDone);

  const ensure = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const granted = await ensureSafPermission();
      setTreeUri(getSafTreeUri());
      setReady(granted);
      if (granted) {
        syncSafTreeUriToServer();
      }
      return granted;
    } finally {
      setChecked(true);
      setBusy(false);
    }
  }, []);

  // Boot-time restore: the grant has to be re-taken after every process death.
  useEffect(() => {
    void ensure();
  }, [ensure]);

  const pick = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const picked = await pickDownloadFolder();
      setTreeUri(getSafTreeUri());
      setReady(picked);
      setChecked(true);
      if (picked) {
        syncSafTreeUriToServer();
      }
      return picked;
    } finally {
      setBusy(false);
    }
  }, []);

  const clear = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const cleared = await clearSafFolder();
      setTreeUri(null);
      setReady(false);
      setChecked(true);
      syncSafTreeUriToServer();
      return cleared;
    } finally {
      setBusy(false);
    }
  }, []);

  const markMigrationDone = useCallback(() => {
    markSafMigrationDone();
    setMigrationDone(true);
  }, []);

  return useMemo(
    () => ({
      treeUri,
      ready,
      checked,
      busy,
      migrationDone,
      ensure,
      pick,
      clear,
      markMigrationDone,
    }),
    [
      treeUri,
      ready,
      checked,
      busy,
      migrationDone,
      ensure,
      pick,
      clear,
      markMigrationDone,
    ],
  );
}

export default useSafLocation;
