import { defaultCover } from '@plugins/helpers/constants';
import NativeFile from '@specs/NativeFile';

import {
  clearLocalCoverUriCache,
  invalidateLocalCoverUri,
  localCoverCandidates,
  localCoverFileUri,
  novelCoverImageSource,
} from '../novelCoverUri';

jest.mock('@services/saf/safFile', () => ({
  getDirectRootAbsolute: jest.fn(),
}));
// Keep the local server "down" so a raw tree-relative path cannot masquerade
// as a loadable Image uri.
jest.mock('@plugins/local/localServerManager', () => ({
  getLocalServerUrl: jest.fn(() => ''),
}));
jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: jest.fn(() => 'test-agent'),
}));

const { getDirectRootAbsolute: getDirectRootAbsoluteMock } = jest.requireMock(
  '@services/saf/safFile',
) as { getDirectRootAbsolute: jest.Mock };

const nativeFile = NativeFile as jest.Mocked<typeof NativeFile>;

/** Only these absolute paths exist on the emulated shared storage. */
const onDisk = (paths: string[]) => {
  nativeFile.exists.mockImplementation(path => paths.includes(path));
};

const SHARED = '/mock/storage/SoraReader';
const SOURCE = { pluginId: 'novelupdates', novelId: 7 };

beforeEach(() => {
  // `clearMocks` does not reach the shared native mock, and some cases assert
  // on `exists` having *not* been called, so its history must go. The cover
  // cache also persists across tests unless explicitly cleared.
  nativeFile.exists.mockReset();
  clearLocalCoverUriCache();
  getDirectRootAbsoluteMock.mockReturnValue(SHARED);
  nativeFile.exists.mockReturnValue(false);
});

describe('localCoverCandidates', () => {
  it('prefers the stored tree-relative cover', () => {
    expect(
      localCoverCandidates('Novels/novelupdates/7/other.png', SOURCE),
    ).toEqual([
      'Novels/novelupdates/7/other.png',
      'Novels/novelupdates/7/cover.png',
    ]);
  });

  it('ignores a remote cover and falls back to the download location', () => {
    expect(
      localCoverCandidates('https://example.test/cover.jpg', SOURCE),
    ).toEqual(['Novels/novelupdates/7/cover.png']);
  });

  it('yields nothing for a plugin item that has no library row yet', () => {
    expect(
      localCoverCandidates('https://example.test/cover.jpg', null),
    ).toEqual([]);
    expect(localCoverCandidates(undefined, null)).toEqual([]);
  });
});

describe('localCoverFileUri', () => {
  it('serves the cover from the shared download root when it is there', () => {
    onDisk([`${SHARED}/Novels/novelupdates/7/cover.png`]);

    expect(localCoverFileUri(null, SOURCE)).toBe(
      `file://${SHARED}/Novels/novelupdates/7/cover.png`,
    );
  });

  it('treats a file uri cover as absolute, not as a tree-relative path', () => {
    // Given a cover that was already stored as a file uri
    onDisk([`${SHARED}/Novels/novelupdates/7/cover.png`]);

    // When it is resolved locally
    const uri = localCoverFileUri(
      `file://${SHARED}/Novels/novelupdates/7/cover.png`,
      SOURCE,
    );

    // Then it is not joined onto the root a second time
    expect(uri).toBe(`file://${SHARED}/Novels/novelupdates/7/cover.png`);
  });

  it('falls back to the conventional path when the stored cover is gone', () => {
    onDisk([`${SHARED}/Novels/novelupdates/7/cover.png`]);

    expect(localCoverFileUri('Novels/novelupdates/7/missing.png', SOURCE)).toBe(
      `file://${SHARED}/Novels/novelupdates/7/cover.png`,
    );
  });

  it('reports no local cover for a remote-only novel', () => {
    expect(
      localCoverFileUri('https://example.test/cover.jpg', SOURCE),
    ).toBeNull();
  });

  it('leaves covers to the local server when direct storage is unusable', () => {
    getDirectRootAbsoluteMock.mockReturnValue(null);
    onDisk([`${SHARED}/Novels/novelupdates/7/cover.png`]);

    expect(localCoverFileUri(null, SOURCE)).toBeNull();
    expect(nativeFile.exists).not.toHaveBeenCalled();
  });
});

describe('local cover cache invalidation', () => {
  it('caches a miss, keeps it after the file appears, re-probes after invalidate', () => {
    const coverPath = `${SHARED}/Novels/novelupdates/7/cover.png`;
    nativeFile.exists.mockReturnValue(false);

    expect(localCoverFileUri(null, SOURCE)).toBeNull();
    expect(nativeFile.exists).toHaveBeenCalledTimes(1);

    onDisk([coverPath]);
    expect(localCoverFileUri(null, SOURCE)).toBeNull();
    expect(nativeFile.exists).toHaveBeenCalledTimes(1); // still the cached miss

    invalidateLocalCoverUri(SOURCE);
    expect(localCoverFileUri(null, SOURCE)).toBe(`file://${coverPath}`);
    expect(nativeFile.exists).toHaveBeenCalledTimes(2);
  });

  it('clearLocalCoverUriCache drops misses for every novel', () => {
    const other = { pluginId: 'novelupdates', novelId: 8 };
    expect(localCoverFileUri(null, SOURCE)).toBeNull();
    expect(localCoverFileUri(null, other)).toBeNull();

    onDisk([
      `${SHARED}/Novels/novelupdates/7/cover.png`,
      `${SHARED}/Novels/novelupdates/8/cover.png`,
    ]);
    clearLocalCoverUriCache();

    expect(localCoverFileUri(null, SOURCE)).not.toBeNull();
    expect(localCoverFileUri(null, other)).not.toBeNull();
  });
});

describe('novelCoverImageSource', () => {
  it('uses the on-disk file without request headers and invalidates on error', () => {
    const coverPath = `${SHARED}/Novels/novelupdates/7/cover.png`;
    onDisk([coverPath]);

    const result = novelCoverImageSource(null, SOURCE);
    expect(result.source).toEqual({ uri: `file://${coverPath}` });
    expect(result.localUri).toBe(`file://${coverPath}`);
    expect(result.onError).toBeDefined();

    onDisk([]);
    result.onError?.();
    expect(localCoverFileUri(null, SOURCE)).toBeNull();
  });

  it('falls back to the placeholder with a User-Agent when nothing can load', () => {
    const result = novelCoverImageSource(null, null);

    expect(result.source).toEqual({
      uri: defaultCover,
      headers: { 'User-Agent': 'test-agent' },
    });
    expect(result.localUri).toBeNull();
    expect(result.onError).toBeUndefined();
  });

  it('uses a remote cover with a User-Agent', () => {
    const result = novelCoverImageSource(
      'https://example.test/cover.jpg',
      null,
    );

    expect(result.source).toEqual({
      uri: 'https://example.test/cover.jpg',
      headers: { 'User-Agent': 'test-agent' },
    });
  });

  it('never hands a raw tree-relative path to Image', () => {
    const result = novelCoverImageSource(
      'Novels/novelupdates/7/other.png',
      null,
    );

    expect((result.source as { uri: string }).uri).toBe(defaultCover);
  });
});
