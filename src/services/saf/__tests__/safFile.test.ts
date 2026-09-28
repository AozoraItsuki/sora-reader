import NativeFile from '@specs/NativeFile';
import NativeSaf from '@specs/NativeSaf';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { pickDirectory } from '@react-native-documents/picker';
import {
  EncodingType,
  StorageAccessFramework,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import {
  clearSafFolder,
  ensureDirectStorage,
  ensureSafPermission,
  getDirectRootAbsolute,
  getSafTreeUri,
  isDirectStorageReady,
  isSafMigrationDone,
  isSafReady,
  markSafMigrationDone,
  normalizeSafPath,
  pickDownloadFolder,
  readDownloadedChapter,
  SAF_DOWNLOAD_TREE_URI,
  SAF_MIGRATION_DONE,
  safDocumentUri,
  safDownloadFile,
  safExists,
  safGetFileSize,
  safMkdir,
  safMove,
  safReadDir,
  safReadFile,
  setSafTreeUri,
  safUnlink,
  safWriteFile,
} from '../safFile';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  StorageAccessFramework: {
    getUriForDirectoryInRoot: jest.fn(
      (name: string) =>
        `content://com.android.externalstorage.documents/root/${name}`,
    ),
    requestDirectoryPermissionsAsync: jest.fn(),
  },
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

const TREE_URI =
  'content://com.android.externalstorage.documents/tree/primary%3ADownload';
/** `SHARED_ROOT` as Storages derives it from the mocked `StoragePath`. */
const SHARED_ROOT = '/mock/storage/SoraReader';

const nativeSaf = NativeSaf as jest.Mocked<typeof NativeSaf>;
const nativeFile = NativeFile as jest.Mocked<typeof NativeFile>;
const storageAccess = StorageAccessFramework as jest.Mocked<
  typeof StorageAccessFramework
>;
const readAsString = readAsStringAsync as jest.MockedFunction<
  typeof readAsStringAsync
>;
const writeAsString = writeAsStringAsync as jest.MockedFunction<
  typeof writeAsStringAsync
>;
const documentPicker = pickDirectory as jest.MockedFunction<
  typeof pickDirectory
>;

const setTree = () => MMKVStorage.set(SAF_DOWNLOAD_TREE_URI, TREE_URI);

/** Turn the direct backend on, the way a granted "all files access" would. */
const grantDirectAccess = async () => {
  nativeFile.hasAllFilesAccess.mockReturnValue(true);
  await ensureDirectStorage();
};

describe('safFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MMKVStorage.clearAll();
    nativeSaf.takePersistablePermission.mockResolvedValue(true);
    nativeSaf.hasTreeAccess.mockResolvedValue(true);
    nativeSaf.releaseTreeUri.mockResolvedValue(true);
    nativeSaf.exists.mockResolvedValue(false);
    nativeSaf.readFile.mockResolvedValue('');
    nativeSaf.readDir.mockResolvedValue([]);
    nativeSaf.getFileSize.mockResolvedValue(0);
    storageAccess.getUriForDirectoryInRoot.mockReturnValue(
      'content://com.android.externalstorage.documents/root/SoraReader',
    );
    storageAccess.requestDirectoryPermissionsAsync.mockResolvedValue({
      granted: false,
    });
    documentPicker.mockRejectedValue({ code: 'OPERATION_CANCELED' });
    nativeFile.hasAllFilesAccess.mockReturnValue(false);
  });

  // The direct backend caches its answer in module state, so every test starts
  // from "not granted" and turns it on explicitly.
  beforeEach(async () => {
    await ensureDirectStorage();
  });

  describe('persisted tree uri', () => {
    it('is null until a folder is picked', () => {
      expect(getSafTreeUri()).toBeNull();
      expect(isSafReady()).toBe(false);
    });

    it('normalizes a stored uri', () => {
      setTree();
      expect(getSafTreeUri()).toBe(TREE_URI);
      setSafTreeUri(`${TREE_URI}/`);
      expect(getSafTreeUri()).toBe(TREE_URI);
    });

    it('is ready once a tree is stored', () => {
      setTree();
      expect(isSafReady()).toBe(true);
    });
  });

  describe('normalizeSafPath', () => {
    it('collapses duplicate and leading slashes', () => {
      expect(normalizeSafPath('/Novels//local/115/index.html')).toBe(
        'Novels/local/115/index.html',
      );
    });

    it('rejects traversal segments', () => {
      expect(() => normalizeSafPath('Novels/../secret')).toThrow(
        '[saf] Unsafe path',
      );
      expect(() => normalizeSafPath('./Novels')).toThrow('[saf] Unsafe path');
    });

    it('rejects absolute uris', () => {
      expect(() =>
        normalizeSafPath('content://provider/tree/primary/Download'),
      ).toThrow('[saf] Not a tree-relative path');
    });

    it('rejects an empty path unless the root is allowed', () => {
      expect(() => normalizeSafPath('/')).toThrow('[saf] Empty path');
      expect(normalizeSafPath('/', { allowRoot: true })).toBe('');
    });
  });

  describe('file operations', () => {
    beforeEach(setTree);

    it('joins relative paths onto the tree uri', () => {
      expect(safDocumentUri('Novels/local/115/index.html')).toBe(
        `${TREE_URI}/Novels/local/115/index.html`,
      );
    });

    it('creates directories natively', async () => {
      await expect(safMkdir('Novels/local/115/456')).resolves.toBe(true);
      expect(nativeSaf.mkdir).toHaveBeenCalledWith(
        TREE_URI,
        'Novels/local/115/456',
      );
    });

    it('writes utf8 by default and honours base64', async () => {
      await safWriteFile('Novels/local/115/index.html', '<p>hi</p>');
      expect(nativeSaf.writeFile).toHaveBeenCalledWith(
        TREE_URI,
        'Novels/local/115/index.html',
        '<p>hi</p>',
        'utf8',
      );

      await safWriteFile('Novels/local/115/0.b64.png', 'aGk=', 'base64');
      expect(nativeSaf.writeFile).toHaveBeenLastCalledWith(
        TREE_URI,
        'Novels/local/115/0.b64.png',
        'aGk=',
        'base64',
      );
    });

    it('reads text and base64 payloads', async () => {
      nativeSaf.readFile.mockResolvedValue('<p>hi</p>');
      await expect(safReadFile('Novels/local/115/index.html')).resolves.toBe(
        '<p>hi</p>',
      );
      expect(nativeSaf.readFile).toHaveBeenCalledWith(
        TREE_URI,
        'Novels/local/115/index.html',
        'utf8',
      );

      await safReadFile('Novels/local/115/0.b64.png', 'base64');
      expect(nativeSaf.readFile).toHaveBeenLastCalledWith(
        TREE_URI,
        'Novels/local/115/0.b64.png',
        'base64',
      );
    });

    it('checks existence, allowing the tree root', async () => {
      nativeSaf.exists.mockResolvedValue(true);
      await expect(safExists('Novels/local/115')).resolves.toBe(true);
      await expect(safExists('')).resolves.toBe(true);
      expect(nativeSaf.exists).toHaveBeenLastCalledWith(TREE_URI, '');
    });

    it('lists directory names', async () => {
      nativeSaf.readDir.mockResolvedValue(['index.html', '0.b64.png']);
      await expect(safReadDir('Novels/local/115/456')).resolves.toEqual([
        'index.html',
        '0.b64.png',
      ]);
      expect(nativeSaf.readDir).toHaveBeenCalledWith(
        TREE_URI,
        'Novels/local/115/456',
      );
    });

    it('moves entries', async () => {
      await expect(
        safMove('Novels/local/115/old.html', 'Novels/local/115/new.html'),
      ).resolves.toBe(true);
      expect(nativeSaf.move).toHaveBeenCalledWith(
        TREE_URI,
        'Novels/local/115/old.html',
        'Novels/local/115/new.html',
      );
    });

    it('removes entries recursively', async () => {
      await expect(safUnlink('Novels/local/115/456')).resolves.toBe(true);
      expect(nativeSaf.unlink).toHaveBeenCalledWith(
        TREE_URI,
        'Novels/local/115/456',
      );
    });

    it('reports file sizes', async () => {
      nativeSaf.getFileSize.mockResolvedValue(2048);
      await expect(safGetFileSize('Novels/local/115/0.b64.png')).resolves.toBe(
        2048,
      );
    });

    it('refuses to touch the tree when no folder is configured', async () => {
      MMKVStorage.clearAll();
      await expect(safMkdir('Novels/local/115')).rejects.toThrow(
        '[saf] No download folder picked yet',
      );
      expect(nativeSaf.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('ensureSafPermission', () => {
    it('returns false when no folder was ever picked', async () => {
      await expect(ensureSafPermission()).resolves.toBe(false);
      expect(nativeSaf.takePersistablePermission).not.toHaveBeenCalled();
    });

    it('re-takes the persisted grant on boot', async () => {
      setTree();
      await expect(ensureSafPermission()).resolves.toBe(true);
      expect(nativeSaf.takePersistablePermission).toHaveBeenCalledWith(
        TREE_URI,
        true,
      );
      expect(nativeSaf.hasTreeAccess).toHaveBeenCalledWith(TREE_URI);
    });

    it('returns false when the grant was revoked', async () => {
      setTree();
      nativeSaf.hasTreeAccess.mockResolvedValue(false);
      await expect(ensureSafPermission()).resolves.toBe(false);
      expect(isSafReady()).toBe(false);
    });

    it('returns false when re-granting throws', async () => {
      setTree();
      nativeSaf.takePersistablePermission.mockRejectedValue(
        new Error('SecurityException'),
      );
      await expect(ensureSafPermission()).resolves.toBe(false);
    });
  });

  describe('pickDownloadFolder', () => {
    it('persists the uri of the folder the SAF picker returned', async () => {
      storageAccess.requestDirectoryPermissionsAsync.mockResolvedValue({
        granted: true,
        directoryUri: `${TREE_URI}/`,
      });

      await expect(pickDownloadFolder()).resolves.toBe(true);

      expect(storageAccess.getUriForDirectoryInRoot).toHaveBeenCalledWith(
        'SoraReader',
      );
      expect(nativeSaf.takePersistablePermission).toHaveBeenCalledWith(
        TREE_URI,
        true,
      );
      expect(MMKVStorage.getString(SAF_DOWNLOAD_TREE_URI)).toBe(TREE_URI);
      expect(getSafTreeUri()).toBe(TREE_URI);
      expect(isSafReady()).toBe(true);
    });

    it('does not prompt twice when the SAF picker is declined', async () => {
      await expect(pickDownloadFolder()).resolves.toBe(false);
      expect(documentPicker).not.toHaveBeenCalled();
      expect(getSafTreeUri()).toBeNull();
    });

    it('falls back to the document picker when SAF is unavailable', async () => {
      storageAccess.requestDirectoryPermissionsAsync.mockRejectedValue(
        new Error('not supported on this device'),
      );
      documentPicker.mockResolvedValue({ uri: TREE_URI } as never);

      await expect(pickDownloadFolder()).resolves.toBe(true);
      expect(documentPicker).toHaveBeenCalledWith({
        requestLongTermAccess: true,
      });
      expect(getSafTreeUri()).toBe(TREE_URI);
    });

    it('stays false when the document picker is cancelled', async () => {
      storageAccess.requestDirectoryPermissionsAsync.mockRejectedValue(
        new Error('not supported on this device'),
      );
      await expect(pickDownloadFolder()).resolves.toBe(false);
      expect(getSafTreeUri()).toBeNull();
    });

    it('stores nothing when the picked folder cannot be written to', async () => {
      storageAccess.requestDirectoryPermissionsAsync.mockResolvedValue({
        granted: true,
        directoryUri: TREE_URI,
      });
      nativeSaf.hasTreeAccess.mockResolvedValue(false);

      await expect(pickDownloadFolder()).resolves.toBe(false);
      expect(getSafTreeUri()).toBeNull();
    });
  });

  describe('clearSafFolder', () => {
    it('releases the grant and forgets the uri', async () => {
      setTree();
      await expect(clearSafFolder()).resolves.toBe(true);
      expect(nativeSaf.releaseTreeUri).toHaveBeenCalledWith(TREE_URI);
      expect(MMKVStorage.contains(SAF_DOWNLOAD_TREE_URI)).toBe(false);
      expect(isSafReady()).toBe(false);
    });
  });

  describe('migration flag', () => {
    it('is stored as the string "1"', () => {
      expect(isSafMigrationDone()).toBe(false);
      markSafMigrationDone();
      expect(MMKVStorage.getString(SAF_MIGRATION_DONE)).toBe('1');
      expect(isSafMigrationDone()).toBe(true);
    });
  });

  describe('safDownloadFile', () => {
    beforeEach(setTree);

    it('defaults to a GET without headers', async () => {
      await safDownloadFile('https://host/a.png', 'Novels/local/a.png');
      expect(nativeSaf.downloadFile).toHaveBeenCalledWith(
        TREE_URI,
        'https://host/a.png',
        'Novels/local/a.png',
        'get',
        {},
        undefined,
      );
    });

    it('forwards a plugin request init as headers, method and body', async () => {
      await safDownloadFile('https://host/b.png', 'Novels/local/b.png', {
        method: 'POST',
        headers: { 'User-Agent': 'Sora', Referer: 'https://host/' },
        body: 'payload',
      });
      expect(nativeSaf.downloadFile).toHaveBeenCalledWith(
        TREE_URI,
        'https://host/b.png',
        'Novels/local/b.png',
        'post',
        { 'User-Agent': 'Sora', Referer: 'https://host/' },
        'payload',
      );
    });

    it('ignores non-string header values', async () => {
      await safDownloadFile('https://host/c.png', 'Novels/local/c.png', {
        headers: { Accept: 'image/*', bad: undefined as unknown as string },
      });
      expect(nativeSaf.downloadFile).toHaveBeenCalledWith(
        TREE_URI,
        'https://host/c.png',
        'Novels/local/c.png',
        'get',
        { Accept: 'image/*' },
        undefined,
      );
    });
  });

  describe('readDownloadedChapter', () => {
    beforeEach(setTree);

    it('returns the stored chapter html', async () => {
      nativeSaf.exists.mockResolvedValue(true);
      nativeSaf.readFile.mockResolvedValue('<html>chapter</html>');
      await expect(
        readDownloadedChapter('Novels/local/115/456/index.html'),
      ).resolves.toBe('<html>chapter</html>');
    });

    it('returns null when the chapter was never downloaded', async () => {
      nativeSaf.exists.mockResolvedValue(false);
      await expect(
        readDownloadedChapter('Novels/local/115/456/index.html'),
      ).resolves.toBeNull();
      expect(nativeSaf.readFile).not.toHaveBeenCalled();
    });

    it('returns null instead of throwing when the tree is gone', async () => {
      MMKVStorage.clearAll();
      await expect(
        readDownloadedChapter('Novels/local/115/456/index.html'),
      ).resolves.toBeNull();
    });
  });

  describe('direct backend', () => {
    it('is not ready until the native probe reports the grant', async () => {
      expect(isDirectStorageReady()).toBe(false);
      expect(getDirectRootAbsolute()).toBeNull();
      expect(isSafReady()).toBe(false);
    });

    it('publishes the shared root once access is granted', async () => {
      await grantDirectAccess();

      expect(isDirectStorageReady()).toBe(true);
      expect(getDirectRootAbsolute()).toBe(SHARED_ROOT);
      // Direct storage answers the same readiness question consumers already ask.
      expect(isSafReady()).toBe(true);
    });

    it('takes precedence over a configured tree', async () => {
      setTree();
      await grantDirectAccess();

      await safMkdir('Novels/local/115');
      expect(nativeFile.mkdir).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115`,
      );
      expect(nativeSaf.mkdir).not.toHaveBeenCalled();
    });

    it('routes every file operation to an absolute path', async () => {
      await grantDirectAccess();

      await safMkdir('Novels/local/115/456');
      expect(nativeFile.mkdir).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/456`,
      );

      await safWriteFile('Novels/local/115/index.html', '<p>hi</p>');
      expect(nativeFile.writeFile).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/index.html`,
        '<p>hi</p>',
      );

      nativeFile.readFile.mockReturnValue('<p>hi</p>');
      await expect(safReadFile('Novels/local/115/index.html')).resolves.toBe(
        '<p>hi</p>',
      );
      expect(nativeFile.readFile).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/index.html`,
      );

      nativeFile.exists.mockReturnValue(true);
      await expect(safExists('Novels/local/115')).resolves.toBe(true);
      expect(nativeFile.exists).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115`,
      );

      nativeFile.readDir.mockReturnValue([
        { name: 'index.html', path: 'p/index.html', isDirectory: false },
        { name: '0.b64.png', path: 'p/0.b64.png', isDirectory: false },
      ]);
      await expect(safReadDir('Novels/local/115/456')).resolves.toEqual([
        'index.html',
        '0.b64.png',
      ]);
      expect(nativeFile.readDir).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/456`,
      );

      nativeFile.getFileSize.mockReturnValue(2048);
      await expect(safGetFileSize('Novels/local/115/0.b64.png')).resolves.toBe(
        2048,
      );

      await safMove('Novels/local/115/a.html', 'Novels/local/115/b.html');
      expect(nativeFile.moveFile).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/a.html`,
        `${SHARED_ROOT}/Novels/local/115/b.html`,
      );

      await expect(safUnlink('Novels/local/115/456')).resolves.toBe(true);
      expect(nativeFile.unlink).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/456`,
      );
    });

    it('keeps refusing paths that could escape the shared root', async () => {
      await grantDirectAccess();

      await expect(safMkdir('../secrets')).rejects.toThrow('[saf] Unsafe path');
      expect(nativeFile.mkdir).not.toHaveBeenCalled();
    });

    it('resolves the tree root itself to the shared root', async () => {
      await grantDirectAccess();

      await expect(safExists('')).resolves.toBeDefined();
      expect(nativeFile.exists).toHaveBeenCalledWith(SHARED_ROOT);
    });

    it('reports a missing entry as absent instead of a silent no-op', async () => {
      await grantDirectAccess();
      nativeFile.exists.mockReturnValue(false);

      await expect(safUnlink('Novels/local/115')).resolves.toBe(false);
      expect(nativeFile.unlink).not.toHaveBeenCalled();
    });

    it('round-trips base64 payloads through expo, which decodes bytes', async () => {
      await grantDirectAccess();
      readAsString.mockResolvedValue('aGk=');

      await expect(
        safReadFile('Novels/local/115/0.b64.png', 'base64'),
      ).resolves.toBe('aGk=');
      expect(readAsString).toHaveBeenCalledWith(
        `file://${SHARED_ROOT}/Novels/local/115/0.b64.png`,
        { encoding: EncodingType.Base64 },
      );

      await safWriteFile('Novels/local/115/0.b64.png', 'aGk=', 'base64');
      expect(writeAsString).toHaveBeenCalledWith(
        `file://${SHARED_ROOT}/Novels/local/115/0.b64.png`,
        'aGk=',
        { encoding: EncodingType.Base64 },
      );
    });

    it('downloads straight into the absolute path', async () => {
      await grantDirectAccess();

      await safDownloadFile('https://host/a.png', 'Novels/local/a.png', {
        headers: { Referer: 'https://host/' },
      });

      expect(nativeFile.downloadFile).toHaveBeenCalledWith(
        'https://host/a.png',
        `${SHARED_ROOT}/Novels/local/a.png`,
        'get',
        { Referer: 'https://host/' },
        undefined,
      );
      expect(nativeSaf.downloadFile).not.toHaveBeenCalled();
    });

    it('serves chapters without a tree uri at all', async () => {
      await grantDirectAccess();
      nativeFile.exists.mockReturnValue(true);
      nativeFile.readFile.mockReturnValue('<html>chapter</html>');

      await expect(
        readDownloadedChapter('Novels/local/115/456/index.html'),
      ).resolves.toBe('<html>chapter</html>');
    });

    it('falls back to the tree as soon as the grant is revoked', async () => {
      setTree();
      await grantDirectAccess();
      nativeFile.hasAllFilesAccess.mockReturnValue(false);
      await ensureDirectStorage();

      await safMkdir('Novels/local/115');
      expect(nativeSaf.mkdir).toHaveBeenCalledWith(
        TREE_URI,
        'Novels/local/115',
      );
    });
  });
});
