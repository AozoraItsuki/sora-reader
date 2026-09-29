import { SAF_DOWNLOAD_TREE_URI } from '@services/saf/safFile';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  StorageAccessFramework: {
    getUriForDirectoryInRoot: jest.fn(
      () => 'content://com.android.externalstorage.documents/root/SoraReader',
    ),
    requestDirectoryPermissionsAsync: jest.fn(),
  },
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

const TREE_URI =
  'content://com.android.externalstorage.documents/tree/primary%3ADownload';
/** `SHARED_NOVELS` as Storages derives it from the mocked `StoragePath`. */
const SHARED_NOVELS = '/mock/storage/SoraReader/Novels';

type Loaded = {
  initLocalServer: () => Promise<void>;
  nativeFile: { hasAllFilesAccess: jest.Mock };
  nativeLocalServer: {
    startServer: jest.Mock;
    setDownloadRoot: jest.Mock;
    setSafTreeUri: jest.Mock;
  };
  nativeSaf: { hasTreeAccess: jest.Mock; takePersistablePermission: jest.Mock };
  mmkv: { set: (key: string, value: string) => void };
};

/**
 * Load a fresh copy of the manager: both it and the direct backend cache their
 * state in module scope, so every scenario needs its own module registry. The
 * native stubs are pulled from inside the same registry so they stay the very
 * instances the manager talks to.
 */
const load = (): Loaded => {
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    loaded = {
      initLocalServer: require('../localServerManager').initLocalServer,
      nativeFile: require('@specs/NativeFile').default,
      nativeLocalServer: require('@specs/NativeLocalServer').default,
      nativeSaf: require('@specs/NativeSaf').default,
      mmkv: require('@utils/mmkv/mmkv').MMKVStorage,
    };
  });
  if (!loaded) {
    throw new Error('isolateModules did not run');
  }
  return loaded;
};

/** Configure the SAF-tree backend with a grant the user actually has. */
const useTree = (env: Loaded) => {
  env.mmkv.set(SAF_DOWNLOAD_TREE_URI, TREE_URI);
  env.nativeSaf.takePersistablePermission.mockResolvedValue(true);
  env.nativeSaf.hasTreeAccess.mockResolvedValue(true);
};

const useDirectStorage = (env: Loaded) => {
  env.nativeFile.hasAllFilesAccess.mockReturnValue(true);
};

describe('initLocalServer download root', () => {
  it('serves the shared download root in direct mode', async () => {
    // Given: all-files access is granted, so downloads live in /sdcard.
    const env = load();
    useDirectStorage(env);

    // When the server boots.
    await env.initLocalServer();

    // Then it reads the shared root, not the legacy app-private directory.
    expect(env.nativeLocalServer.setDownloadRoot).toHaveBeenCalledWith(
      SHARED_NOVELS,
    );
    expect(env.nativeLocalServer.setSafTreeUri).toHaveBeenCalledWith('');
  });

  it('hands the download root over before the server starts', async () => {
    // Given: the server captures its base path in startServer, so a later
    // setDownloadRoot would be too late.
    const env = load();
    useDirectStorage(env);

    // When
    await env.initLocalServer();

    // Then
    const rootOrder =
      env.nativeLocalServer.setDownloadRoot.mock.invocationCallOrder[0];
    const startOrder =
      env.nativeLocalServer.startServer.mock.invocationCallOrder[0];
    expect(rootOrder).toBeLessThan(startOrder);
  });

  it('keeps serving the SAF tree in tree mode', async () => {
    // Given: no all-files access, so the user picked a folder instead.
    const env = load();
    useTree(env);
    env.nativeFile.hasAllFilesAccess.mockReturnValue(false);

    // When
    await env.initLocalServer();

    // Then the native module keeps its default root and reads the tree.
    expect(env.nativeLocalServer.setDownloadRoot).toHaveBeenCalledWith('');
    expect(env.nativeLocalServer.setSafTreeUri).toHaveBeenCalledWith(TREE_URI);
  });
});
