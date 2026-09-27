import {
  chapterImageRel,
  chapterIndexRel,
  chapterRel,
  coverRel,
  isAbsoluteUri,
  legacyDownloadPath,
  novelDirRel,
  nomediaRel,
  NOVELS_ROOT,
  resolveDownloadUrl,
} from '../DownloadPaths';
import { getLocalServerUrl } from '@plugins/local/localServerManager';
import { NOVEL_STORAGE } from '@utils/Storages';

jest.mock('@plugins/local/localServerManager', () => ({
  getLocalServerUrl: jest.fn(() => 'http://127.0.0.1:54321'),
}));

const getLocalServerUrlMock = getLocalServerUrl as jest.MockedFunction<
  typeof getLocalServerUrl
>;

describe('DownloadPaths', () => {
  beforeEach(() => {
    getLocalServerUrlMock.mockReturnValue('http://127.0.0.1:54321');
  });

  describe('builders', () => {
    it('keeps the Novels root as the tree-relative prefix', () => {
      expect(NOVELS_ROOT).toBe('Novels');
      expect(novelDirRel('local', 115)).toBe('Novels/local/115');
    });

    it('builds the novel directory for an online plugin too', () => {
      expect(novelDirRel('my-plugin', 12377)).toBe(
        'Novels/my-plugin/12377',
      );
    });

    it('builds the chapter directory', () => {
      expect(chapterRel('local', 115, 456)).toBe('Novels/local/115/456');
    });

    it('builds the chapter index path', () => {
      expect(chapterIndexRel('local', 115, 456)).toBe(
        'Novels/local/115/456/index.html',
      );
    });

    it('builds chapter image paths with the ordinal the reader expects', () => {
      expect(chapterImageRel('local', 115, 456, 0)).toBe(
        'Novels/local/115/456/0.b64.png',
      );
      expect(chapterImageRel('local', 115, 456, 3)).toBe(
        'Novels/local/115/456/3.b64.png',
      );
    });

    it('builds the cover path', () => {
      expect(coverRel('my-plugin', 12377)).toBe(
        'Novels/my-plugin/12377/cover.png',
      );
    });

    it('builds the .nomedia marker path', () => {
      expect(nomediaRel('local', 115, 456)).toBe(
        'Novels/local/115/456/.nomedia',
      );
    });

    it('accepts string ids coming straight from the database', () => {
      expect(chapterIndexRel('local', '115', '456')).toBe(
        'Novels/local/115/456/index.html',
      );
    });
  });

  describe('resolveDownloadUrl', () => {
    it('joins the local server url with the tree-relative path', () => {
      expect(resolveDownloadUrl(chapterIndexRel('local', 115, 456))).toBe(
        'http://127.0.0.1:54321/Novels/local/115/456/index.html',
      );
    });

    it('tolerates a trailing slash on the base url', () => {
      getLocalServerUrlMock.mockReturnValue('http://127.0.0.1:9999/');
      expect(resolveDownloadUrl(coverRel('local', 115))).toBe(
        'http://127.0.0.1:9999/Novels/local/115/cover.png',
      );
    });

    it('leaves remote and already-addressed values untouched', () => {
      const remote = 'https://example.com/covers/1.jpg';
      expect(resolveDownloadUrl(remote)).toBe(remote);
      expect(resolveDownloadUrl('content://tree/Novels/a/b/c')).toBe(
        'content://tree/Novels/a/b/c',
      );
      expect(resolveDownloadUrl('file:///data/a/b.png')).toBe(
        'file:///data/a/b.png',
      );
      expect(resolveDownloadUrl('data:image/png;base64,AA')).toBe(
        'data:image/png;base64,AA',
      );
      // Even with the server down, an absolute value stays absolute.
      getLocalServerUrlMock.mockReturnValue('');
      expect(resolveDownloadUrl(remote)).toBe(remote);
    });

    it('returns the relative path while the server is not running', () => {
      getLocalServerUrlMock.mockReturnValue('');
      expect(resolveDownloadUrl(chapterIndexRel('local', 115, 456))).toBe(
        'Novels/local/115/456/index.html',
      );
    });

    it('returns undefined for a missing path', () => {
      expect(resolveDownloadUrl('')).toBeUndefined();
      expect(resolveDownloadUrl(null)).toBeUndefined();
      expect(resolveDownloadUrl(undefined)).toBeUndefined();
    });
  });

  describe('isAbsoluteUri', () => {
    it('detects schemes and rooted paths', () => {
      expect(isAbsoluteUri('https://example.com/a.png')).toBe(true);
      expect(isAbsoluteUri('HTTP://example.com/a.png')).toBe(true);
      expect(isAbsoluteUri('content://tree/document/1')).toBe(true);
      expect(isAbsoluteUri('file:///a/b.png')).toBe(true);
      expect(isAbsoluteUri('data:image/png;base64,AA')).toBe(true);
      expect(isAbsoluteUri('/Novels/local/115/cover.png')).toBe(true);
    });

    it('leaves tree-relative paths unclaimed', () => {
      expect(isAbsoluteUri('Novels/local/115/cover.png')).toBe(false);
      expect(isAbsoluteUri('cover.png')).toBe(false);
    });
  });

  describe('legacyDownloadPath', () => {
    it('maps a tree-relative path back into app-private storage once', () => {
      expect(legacyDownloadPath(chapterIndexRel('local', 115, 456))).toBe(
        `${NOVEL_STORAGE}/local/115/456/index.html`,
      );
    });

    it('does not duplicate the Novels root', () => {
      expect(legacyDownloadPath('Novels')).toBe(NOVEL_STORAGE);
      expect(legacyDownloadPath('/Novels/local/115/cover.png')).toBe(
        `${NOVEL_STORAGE}/local/115/cover.png`,
      );
    });

    it('leaves a path without the Novels root alone', () => {
      expect(legacyDownloadPath('local/115/cover.png')).toBe(
        `${NOVEL_STORAGE}/local/115/cover.png`,
      );
    });
  });
});
