import NativeFile from '@specs/NativeFile';

import { localCoverCandidates, localCoverFileUri } from '../novelCoverUri';

jest.mock('@services/saf/safFile', () => ({
  getDirectRootAbsolute: jest.fn(),
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
  beforeEach(() => {
    // `clearMocks` does not reach the shared native mock, and these cases assert
    // on `exists` having *not* been called, so the history must go.
    nativeFile.exists.mockReset();
    getDirectRootAbsoluteMock.mockReturnValue(SHARED);
    nativeFile.exists.mockReturnValue(false);
  });

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
