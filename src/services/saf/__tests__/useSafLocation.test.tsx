import NativeLocalServer from '@specs/NativeLocalServer';
import NativeSaf from '@specs/NativeSaf';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { SHARED_NOVELS } from '@utils/Storages';
import { StorageAccessFramework } from 'expo-file-system/legacy';

import { SAF_DOWNLOAD_TREE_URI, SAF_MIGRATION_DONE } from '../safFile';
import { useSafLocation } from '../useSafLocation';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    getUriForDirectoryInRoot: jest.fn(
      (name: string) =>
        `content://com.android.externalstorage.documents/root/${name}`,
    ),
    requestDirectoryPermissionsAsync: jest.fn(),
  },
}));

const TREE_URI =
  'content://com.android.externalstorage.documents/tree/primary%3ADownload';

const nativeSaf = NativeSaf as jest.Mocked<typeof NativeSaf>;
const nativeLocalServer = NativeLocalServer as jest.Mocked<
  typeof NativeLocalServer
>;
const storageAccess = StorageAccessFramework as jest.Mocked<
  typeof StorageAccessFramework
>;

/** Mount the hook and let the boot-time permission restore settle. */
const renderSafLocation = async () => {
  const utils = renderHook(() => useSafLocation());
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return utils;
};

describe('useSafLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MMKVStorage.clearAll();
    nativeSaf.takePersistablePermission.mockResolvedValue(true);
    nativeSaf.hasTreeAccess.mockResolvedValue(true);
    nativeSaf.releaseTreeUri.mockResolvedValue(true);
    storageAccess.getUriForDirectoryInRoot.mockReturnValue(
      'content://com.android.externalstorage.documents/root/SoraReader',
    );
    storageAccess.requestDirectoryPermissionsAsync.mockResolvedValue({
      granted: false,
    });
  });

  it('restores the persisted grant on mount', async () => {
    MMKVStorage.set(SAF_DOWNLOAD_TREE_URI, TREE_URI);

    const { result } = await renderSafLocation();

    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(nativeSaf.takePersistablePermission).toHaveBeenCalledWith(
      TREE_URI,
      true,
    );
    expect(result.current.treeUri).toBe(TREE_URI);
    expect(result.current.ready).toBe(true);
    expect(result.current.busy).toBe(false);
    // The local server reads the tree it was handed, and keeps its default
    // root so it resolves downloads through the tree.
    expect(nativeLocalServer.setSafTreeUri).toHaveBeenCalledWith(TREE_URI);
    expect(nativeLocalServer.setDownloadRoot).toHaveBeenCalledWith('');
  });

  it('reports "not ready" when no folder was ever picked', async () => {
    const { result } = await renderSafLocation();

    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.treeUri).toBeNull();
    expect(result.current.ready).toBe(false);
    expect(nativeSaf.takePersistablePermission).not.toHaveBeenCalled();
    expect(nativeLocalServer.setSafTreeUri).not.toHaveBeenCalled();
  });

  it('reports "not ready" when the grant was revoked while away', async () => {
    MMKVStorage.set(SAF_DOWNLOAD_TREE_URI, TREE_URI);
    nativeSaf.hasTreeAccess.mockResolvedValue(false);

    const { result } = await renderSafLocation();

    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.treeUri).toBe(TREE_URI);
    expect(result.current.ready).toBe(false);
  });

  it('exposes the picked folder after a successful pick', async () => {
    storageAccess.requestDirectoryPermissionsAsync.mockResolvedValue({
      granted: true,
      directoryUri: TREE_URI,
    });

    const { result } = await renderSafLocation();
    await waitFor(() => expect(result.current.checked).toBe(true));

    await act(async () => {
      await expect(result.current.pick()).resolves.toBe(true);
    });

    expect(result.current.treeUri).toBe(TREE_URI);
    expect(result.current.ready).toBe(true);
    expect(MMKVStorage.getString(SAF_DOWNLOAD_TREE_URI)).toBe(TREE_URI);
    expect(nativeLocalServer.setSafTreeUri).toHaveBeenLastCalledWith(TREE_URI);
  });

  it('leaves the state untouched when the picker is declined', async () => {
    const { result } = await renderSafLocation();
    await waitFor(() => expect(result.current.checked).toBe(true));

    await act(async () => {
      await expect(result.current.pick()).resolves.toBe(false);
    });

    expect(result.current.treeUri).toBeNull();
    expect(result.current.ready).toBe(false);
  });

  it('clears the folder and hands the server an empty uri', async () => {
    MMKVStorage.set(SAF_DOWNLOAD_TREE_URI, TREE_URI);

    const { result } = await renderSafLocation();
    await waitFor(() => expect(result.current.checked).toBe(true));

    await act(async () => {
      await expect(result.current.clear()).resolves.toBe(true);
    });

    expect(nativeSaf.releaseTreeUri).toHaveBeenCalledWith(TREE_URI);
    expect(result.current.treeUri).toBeNull();
    expect(result.current.ready).toBe(false);
    expect(nativeLocalServer.setSafTreeUri).toHaveBeenLastCalledWith('');
  });

  it('tracks the migration flag', async () => {
    const { result } = await renderSafLocation();
    expect(result.current.migrationDone).toBe(false);

    act(() => {
      result.current.markMigrationDone();
    });

    expect(result.current.migrationDone).toBe(true);
    expect(MMKVStorage.getString(SAF_MIGRATION_DONE)).toBe('1');
  });

  it('re-runs the permission check on demand', async () => {
    MMKVStorage.set(SAF_DOWNLOAD_TREE_URI, TREE_URI);

    const { result } = await renderSafLocation();
    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(nativeSaf.takePersistablePermission).toHaveBeenCalledTimes(1);

    await act(async () => {
      await expect(result.current.ensure()).resolves.toBe(true);
    });

    expect(nativeSaf.takePersistablePermission).toHaveBeenCalledTimes(2);
    expect(nativeLocalServer.setSafTreeUri).toHaveBeenCalledTimes(2);
    expect(result.current.checked).toBe(true);
  });
});

/**
 * The mode switch is the contract every download read depends on: exactly one of
 * the shared root and the SAF tree is ever handed to the server, so a switch can
 * never leave the previous location behind.
 *
 * `syncSafTreeUriToServer` only reads the cached permission probe, so each case
 * performs the real switch sequence — probe, then hand over — in a fresh module
 * registry, because the direct backend caches its last answer in module scope.
 */
describe('syncSafTreeUriToServer', () => {
  beforeEach(() => {
    // The shared `beforeEach` above is scoped to the hook, so the call history
    // these two cases assert on has to be cleared here.
    jest.clearAllMocks();
  });

  const loadSwitch = (hasAllFilesAccess: boolean) => {
    const env = {
      probe: async () => false,
      sync: () => {},
      nativeLocalServer: undefined as unknown as jest.Mocked<
        typeof NativeLocalServer
      >,
    };
    jest.isolateModules(() => {
      require('@specs/NativeFile').default.hasAllFilesAccess.mockReturnValue(
        hasAllFilesAccess,
      );
      require('@utils/mmkv/mmkv').MMKVStorage.set(
        SAF_DOWNLOAD_TREE_URI,
        TREE_URI,
      );
      const safFile = require('../safFile');
      env.probe = safFile.ensureDirectStorage;
      env.sync = require('../useSafLocation').syncSafTreeUriToServer;
      env.nativeLocalServer = require('@specs/NativeLocalServer')
        .default as jest.Mocked<typeof NativeLocalServer>;
    });
    return env;
  };

  it('hands over the shared download root in direct mode', async () => {
    // Given: the user just granted all-files access
    const env = loadSwitch(true);

    // When the app switches backends
    await expect(env.probe()).resolves.toBe(true);
    env.sync();

    // Then the server reads the shared root and drops the tree
    expect(env.nativeLocalServer.setDownloadRoot).toHaveBeenCalledWith(
      SHARED_NOVELS,
    );
    expect(env.nativeLocalServer.setSafTreeUri).toHaveBeenCalledWith('');
  });

  it('hands over the tree and no explicit root in tree mode', async () => {
    // Given: all-files access was declined, so the picked tree stays in charge
    const env = loadSwitch(false);

    // When
    await expect(env.probe()).resolves.toBe(false);
    env.sync();

    // Then
    expect(env.nativeLocalServer.setDownloadRoot).toHaveBeenCalledWith('');
    expect(env.nativeLocalServer.setSafTreeUri).toHaveBeenCalledWith(TREE_URI);
  });
});
