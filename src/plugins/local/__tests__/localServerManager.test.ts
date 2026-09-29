/** `SHARED_NOVELS` as Storages derives it from the mocked `StoragePath`. */
const SHARED_NOVELS = '/mock/storage/SoraReader/Novels';

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

type Loaded = {
  initLocalServer: () => Promise<void>;
  nativeFile: { hasAllFilesAccess: jest.Mock };
  nativeLocalServer: {
    startServer: jest.Mock;
    setDownloadRoot: jest.Mock;
  };
};

/**
 * Load a fresh copy of the manager: the direct backend caches its answer in
 * module scope, so every scenario needs its own module registry. The native
 * stubs are pulled from inside the same registry so they stay the very
 * instances the manager talks to.
 */
const load = (): Loaded => {
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    loaded = {
      initLocalServer: require('../localServerManager').initLocalServer,
      nativeFile: require('@specs/NativeFile').default,
      nativeLocalServer: require('@specs/NativeLocalServer').default,
    };
  });
  if (!loaded) {
    throw new Error('isolateModules did not run');
  }
  return loaded;
};

describe('initLocalServer download root', () => {
  it('serves the shared download root in direct mode', async () => {
    // Given: all-files access is granted, so downloads live in /sdcard.
    const env = load();
    env.nativeFile.hasAllFilesAccess.mockReturnValue(true);

    // When the server boots.
    await env.initLocalServer();

    // Then it reads the shared root, not the legacy app-private directory.
    expect(env.nativeLocalServer.setDownloadRoot).toHaveBeenCalledWith(
      SHARED_NOVELS,
    );
  });

  it('hands the download root over before the server starts', async () => {
    // Given: the server captures its base path in startServer, so a later
    // setDownloadRoot would be too late.
    const env = load();
    env.nativeFile.hasAllFilesAccess.mockReturnValue(true);

    // When
    await env.initLocalServer();

    // Then
    const rootOrder =
      env.nativeLocalServer.setDownloadRoot.mock.invocationCallOrder[0];
    const startOrder =
      env.nativeLocalServer.startServer.mock.invocationCallOrder[0];
    expect(rootOrder).toBeLessThan(startOrder);
  });

  it('still syncs the shared root when access is not granted yet', async () => {
    // Given: the grant is missing (setup screen still pending).
    const env = load();
    env.nativeFile.hasAllFilesAccess.mockReturnValue(false);

    // When
    await env.initLocalServer();

    // Then the sync is unconditional — the server never keeps a stale root.
    expect(env.nativeLocalServer.setDownloadRoot).toHaveBeenCalledWith(
      SHARED_NOVELS,
    );
  });
});
