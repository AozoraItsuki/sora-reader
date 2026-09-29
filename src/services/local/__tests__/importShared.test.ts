import { importAssetIntoTree } from '@services/local/importShared';
import NativeFile from '@specs/NativeFile';
import { readAsStringAsync } from 'expo-file-system/legacy';

jest.mock('@strings/translations', () => ({
  getString: (key: string) => key,
}));
jest.mock('@database/db', () => ({ dbManager: { write: jest.fn() } }));
jest.mock('@database/queries/NovelQueries', () => ({
  updateNovelCategoryById: jest.fn(),
  updateNovelInfo: jest.fn(),
}));
jest.mock('@plugins/pluginManager', () => ({ LOCAL_PLUGIN_ID: 'local' }));
jest.mock('@services/saf/safFile', () => ({
  safMkdir: jest.fn(),
  safWriteFile: jest.fn().mockResolvedValue(true),
}));
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: jest.fn(async (uri: string) => `base64(${uri})`),
}));

const nativeExists = NativeFile.exists as jest.MockedFunction<
  typeof NativeFile.exists
>;
const readAsString = readAsStringAsync as jest.MockedFunction<
  typeof readAsStringAsync
>;
const {
  safWriteFile,
}: {
  safWriteFile: jest.Mock;
} = jest.requireMock('@services/saf/safFile');

const SOURCE = '/storage/emulated/0/SoraReader/scratch/page-1.png';
const DEST = 'Novels/local/115/cover.png';

beforeEach(() => {
  jest.clearAllMocks();
  nativeExists.mockReturnValue(true);
});

describe('importAssetIntoTree', () => {
  it('reads the source through expo as a file:// uri', async () => {
    // Given an asset sitting in app-private scratch space.
    // When the importer copies it into the download tree.
    await importAssetIntoTree(SOURCE, DEST);

    // Then expo receives a `file://` uri; a bare path makes it throw
    // "Unsupported scheme" and the asset never lands.
    expect(readAsString).toHaveBeenCalledWith(`file://${SOURCE}`, {
      encoding: 'base64',
    });
  });

  it('probes the source as a bare path, which is what java.io.File needs', async () => {
    // Given/When
    await importAssetIntoTree(SOURCE, DEST);

    // Then the existence check is NOT given the `file://` prefix, which
    // `NativeFile.exists` cannot resolve.
    expect(nativeExists).toHaveBeenCalledWith(SOURCE);
  });

  it('decodes a percent-escaped source before addressing it', async () => {
    // Given a source path that still carries its percent escapes.
    // When
    await importAssetIntoTree(
      '/storage/emulated/0/My%20Novels/page-1.png',
      DEST,
    );

    // Then both consumers get the decoded path, only expo gets the scheme.
    expect(nativeExists).toHaveBeenCalledWith(
      '/storage/emulated/0/My Novels/page-1.png',
    );
    expect(readAsString).toHaveBeenCalledWith(
      'file:///storage/emulated/0/My Novels/page-1.png',
      { encoding: 'base64' },
    );
  });

  it('does not prefix a source that already carries a scheme', async () => {
    // Given/When
    await importAssetIntoTree(`file://${SOURCE}`, DEST);

    // Then the uri is passed through instead of becoming `file://file://`.
    expect(readAsString).toHaveBeenCalledWith(`file://${SOURCE}`, {
      encoding: 'base64',
    });
  });

  it('reports failure without reading when the source is gone', async () => {
    // Given a source the importer cannot see.
    nativeExists.mockReturnValue(false);

    // When
    const imported = await importAssetIntoTree(SOURCE, DEST);

    // Then the failure is reported instead of thrown, so one broken asset
    // cannot abort the whole import.
    expect(imported).toBe(false);
    expect(readAsString).not.toHaveBeenCalled();
    expect(safWriteFile).not.toHaveBeenCalled();
  });

  it('writes the base64 payload expo returned to the destination', async () => {
    // Given/When
    await importAssetIntoTree(SOURCE, DEST);

    // Then
    expect(safWriteFile).toHaveBeenCalledWith(
      DEST,
      `base64(file://${SOURCE})`,
      'base64',
    );
  });
});
