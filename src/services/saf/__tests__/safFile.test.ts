import NativeFile from '@specs/NativeFile';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';

import {
  ensureDirectStorage,
  getDirectRootAbsolute,
  isDirectStorageReady,
  isSafMigrationDone,
  isSafReady,
  markSafMigrationDone,
  normalizeSafPath,
  readDownloadedChapter,
  SAF_MIGRATION_DONE,
  safDocumentUri,
  safDownloadFile,
  safExists,
  safGetFileSize,
  safMkdir,
  safMove,
  safReadDir,
  safReadFile,
  safUnlink,
  safWriteFile,
} from '../safFile';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: jest.fn(async () => ''),
}));

const NOT_GRANTED = '[saf] All-files access has not been granted';
/** `SHARED_ROOT` as Storages derives it from the mocked `StoragePath`. */
const SHARED_ROOT = '/mock/storage/SoraReader';

const nativeFile = NativeFile as jest.Mocked<typeof NativeFile>;
const readAsString = readAsStringAsync as jest.MockedFunction<
  typeof readAsStringAsync
>;

/** Turn the direct backend on, the way a granted "all files access" would. */
const grantDirectAccess = async () => {
  nativeFile.hasAllFilesAccess.mockReturnValue(true);
  await ensureDirectStorage();
};

describe('safFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MMKVStorage.clearAll();
    nativeFile.hasAllFilesAccess.mockReturnValue(false);
    nativeFile.exists.mockReturnValue(false);
    nativeFile.readDir.mockReturnValue([]);
    nativeFile.getFileSize.mockReturnValue(0);
  });

  // The direct backend caches its answer in module state, so every test starts
  // from "not granted" and turns it on explicitly.
  beforeEach(async () => {
    await ensureDirectStorage();
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
      ).toThrow('[saf] Not a download-root-relative path');
    });

    it('rejects an empty path unless the root is allowed', () => {
      expect(() => normalizeSafPath('/')).toThrow('[saf] Empty path');
      expect(normalizeSafPath('/', { allowRoot: true })).toBe('');
    });
  });

  describe('readiness', () => {
    it('is not ready until the native probe reports the grant', () => {
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
  });

  describe('safDocumentUri', () => {
    it('resolves a relative path to a file uri under the shared root', async () => {
      await grantDirectAccess();

      expect(safDocumentUri('Novels/local/115/index.html')).toBe(
        `file://${SHARED_ROOT}/Novels/local/115/index.html`,
      );
    });

    it('throws while the grant is missing', () => {
      expect(() => safDocumentUri('Novels/local/115/index.html')).toThrow(
        NOT_GRANTED,
      );
    });
  });

  describe('file operations', () => {
    beforeEach(grantDirectAccess);

    it('creates directories natively', async () => {
      await expect(safMkdir('Novels/local/115/456')).resolves.toBe(true);
      expect(nativeFile.mkdir).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/456`,
      );
    });

    it('writes utf8 through the native text writer', async () => {
      await safWriteFile('Novels/local/115/index.html', '<p>hi</p>');
      expect(nativeFile.writeFile).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/index.html`,
        '<p>hi</p>',
      );
    });

    it('decodes base64 natively because expo rejects shared-storage writes', async () => {
      await safWriteFile('Novels/local/115/0.b64.png', 'aGk=', 'base64');
      expect(nativeFile.writeFileBase64).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/0.b64.png`,
        'aGk=',
      );
    });

    it('reads text straight from disk', async () => {
      nativeFile.readFile.mockReturnValue('<p>hi</p>');
      await expect(safReadFile('Novels/local/115/index.html')).resolves.toBe(
        '<p>hi</p>',
      );
      expect(nativeFile.readFile).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/index.html`,
      );
    });

    it('decodes base64 reads through expo, which accepts file uris', async () => {
      readAsString.mockResolvedValue('aGk=');

      await expect(
        safReadFile('Novels/local/115/0.b64.png', 'base64'),
      ).resolves.toBe('aGk=');
      expect(readAsString).toHaveBeenCalledWith(
        `file://${SHARED_ROOT}/Novels/local/115/0.b64.png`,
        { encoding: EncodingType.Base64 },
      );
    });

    it('checks existence, allowing the shared root itself', async () => {
      nativeFile.exists.mockReturnValue(true);
      await expect(safExists('Novels/local/115')).resolves.toBe(true);
      await expect(safExists('')).resolves.toBe(true);
      expect(nativeFile.exists).toHaveBeenLastCalledWith(SHARED_ROOT);
    });

    it('lists directory names', async () => {
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
    });

    it('moves entries', async () => {
      await expect(
        safMove('Novels/local/115/old.html', 'Novels/local/115/new.html'),
      ).resolves.toBe(true);
      expect(nativeFile.moveFile).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/old.html`,
        `${SHARED_ROOT}/Novels/local/115/new.html`,
      );
    });

    it('removes entries recursively, reporting a miss as false', async () => {
      nativeFile.exists.mockReturnValue(true);
      await expect(safUnlink('Novels/local/115/456')).resolves.toBe(true);
      expect(nativeFile.unlink).toHaveBeenCalledWith(
        `${SHARED_ROOT}/Novels/local/115/456`,
      );

      nativeFile.exists.mockReturnValue(false);
      await expect(safUnlink('Novels/local/115')).resolves.toBe(false);
      expect(nativeFile.unlink).toHaveBeenCalledTimes(1);
    });

    it('reports file sizes', async () => {
      nativeFile.getFileSize.mockReturnValue(2048);
      await expect(safGetFileSize('Novels/local/115/0.b64.png')).resolves.toBe(
        2048,
      );
    });

    it('keeps refusing paths that could escape the shared root', async () => {
      await expect(safMkdir('../secrets')).rejects.toThrow('[saf] Unsafe path');
      expect(nativeFile.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('without the grant', () => {
    it('refuses every operation while the grant is missing', async () => {
      await expect(safMkdir('Novels/local/115')).rejects.toThrow(NOT_GRANTED);
      await expect(safReadFile('Novels/local/115/index.html')).rejects.toThrow(
        NOT_GRANTED,
      );
      expect(nativeFile.mkdir).not.toHaveBeenCalled();
      expect(nativeFile.readFile).not.toHaveBeenCalled();
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
    beforeEach(grantDirectAccess);

    it('defaults to a GET without headers', async () => {
      await safDownloadFile('https://host/a.png', 'Novels/local/a.png');
      expect(nativeFile.downloadFile).toHaveBeenCalledWith(
        'https://host/a.png',
        `${SHARED_ROOT}/Novels/local/a.png`,
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
      expect(nativeFile.downloadFile).toHaveBeenCalledWith(
        'https://host/b.png',
        `${SHARED_ROOT}/Novels/local/b.png`,
        'post',
        { 'User-Agent': 'Sora', Referer: 'https://host/' },
        'payload',
      );
    });

    it('ignores non-string header values', async () => {
      await safDownloadFile('https://host/c.png', 'Novels/local/c.png', {
        headers: { Accept: 'image/*', bad: undefined as unknown as string },
      });
      expect(nativeFile.downloadFile).toHaveBeenCalledWith(
        'https://host/c.png',
        `${SHARED_ROOT}/Novels/local/c.png`,
        'get',
        { Accept: 'image/*' },
        undefined,
      );
    });
  });

  describe('readDownloadedChapter', () => {
    beforeEach(grantDirectAccess);

    it('returns the stored chapter html', async () => {
      nativeFile.exists.mockReturnValue(true);
      nativeFile.readFile.mockReturnValue('<html>chapter</html>');
      await expect(
        readDownloadedChapter('Novels/local/115/456/index.html'),
      ).resolves.toBe('<html>chapter</html>');
    });

    it('returns null when the chapter was never downloaded', async () => {
      nativeFile.exists.mockReturnValue(false);
      await expect(
        readDownloadedChapter('Novels/local/115/456/index.html'),
      ).resolves.toBeNull();
      expect(nativeFile.readFile).not.toHaveBeenCalled();
    });

    it('returns null instead of throwing when the read fails', async () => {
      nativeFile.exists.mockReturnValue(true);
      nativeFile.readFile.mockImplementation(() => {
        throw new Error('EACCES');
      });
      await expect(
        readDownloadedChapter('Novels/local/115/456/index.html'),
      ).resolves.toBeNull();
    });
  });
});
