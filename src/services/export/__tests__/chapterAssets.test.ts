import {
  isSafReady,
  probeDirectStorage,
  safExists,
  safReadFile,
} from '@services/saf/safFile';
import NativeFile from '@specs/NativeFile';
import { legacyDownloadPath } from '@utils/DownloadPaths';

import {
  dropMissingChapterImages,
  readDownloadedChapterHtml,
} from '../chapterAssets';

jest.mock('@services/saf/safFile', () => ({
  isSafReady: jest.fn(() => true),
  probeDirectStorage: jest.fn(() => false),
  safExists: jest.fn(async () => true),
  safReadFile: jest.fn(async () => ''),
}));

const isSafReadyMock = isSafReady as jest.MockedFunction<typeof isSafReady>;
const probeDirectStorageMock = probeDirectStorage as jest.MockedFunction<
  typeof probeDirectStorage
>;
const safExistsMock = safExists as jest.MockedFunction<typeof safExists>;
const safReadFileMock = safReadFile as jest.MockedFunction<typeof safReadFile>;
const nativeFileExists = NativeFile.exists as jest.MockedFunction<
  typeof NativeFile.exists
>;
const nativeFileReadFile = NativeFile.readFile as jest.MockedFunction<
  typeof NativeFile.readFile
>;

const PLUGIN_ID = 'novelupdates';
const NOVEL_ID = 7;
const CHAPTER_ID = 42;

const chapterDir = `Novels/${PLUGIN_ID}/${NOVEL_ID}/${CHAPTER_ID}`;
const chapterIndex = `${chapterDir}/index.html`;

beforeEach(() => {
  // `clearMocks` does not reach mocks built inside a `jest.mock` factory, so the
  // call history every assertion below depends on is cleared here.
  [
    isSafReadyMock,
    probeDirectStorageMock,
    safExistsMock,
    safReadFileMock,
  ].forEach(mock => mock.mockClear());
  isSafReadyMock.mockReturnValue(true);
  probeDirectStorageMock.mockReturnValue(false);
  safExistsMock.mockResolvedValue(true);
  safReadFileMock.mockResolvedValue('<html>downloaded</html>');
  nativeFileExists.mockReturnValue(true);
  nativeFileReadFile.mockReturnValue('<html>legacy</html>');
});

describe('dropMissingChapterImages', () => {
  it('removes an image whose downloaded asset is gone', async () => {
    // Given a chapter whose only image was never downloaded
    safExistsMock.mockResolvedValue(false);
    nativeFileExists.mockReturnValue(false);
    const content = `<p>Text</p><figure><img src="0.b64.png"></figure>`;
    // When the chapter is prepared for export
    const result = await dropMissingChapterImages(
      content,
      PLUGIN_ID,
      NOVEL_ID,
      CHAPTER_ID,
    );
    // Then the broken image and its figure are dropped
    expect(result).toBe('<p>Text</p>');
  });

  it('keeps an image whose downloaded asset is present', async () => {
    // Given a chapter whose image is on disk
    const content = `<figure><img src="0.b64.png"></figure>`;
    // When the chapter is prepared for export
    const result = await dropMissingChapterImages(
      content,
      PLUGIN_ID,
      NOVEL_ID,
      CHAPTER_ID,
    );
    // Then the figure survives untouched
    expect(result).toBe(content);
  });

  it('leaves remote and inline images alone', async () => {
    // Given a chapter referencing remote and inline images only
    safExistsMock.mockResolvedValue(false);
    nativeFileExists.mockReturnValue(false);
    const content = `<img src="https://example.com/a.png"><img src="data:image/png;base64,AA">`;
    // When the chapter is prepared for export
    const result = await dropMissingChapterImages(
      content,
      PLUGIN_ID,
      NOVEL_ID,
      CHAPTER_ID,
    );
    // Then neither is mistaken for a missing chapter-local download
    expect(result).toBe(content);
  });

  it('keeps an image that resolves inside the chapter directory', async () => {
    // Given a legacy absolute image uri pointing into this chapter. The fixture
    // is built from the real legacy root, so it cannot drift away from the path
    // the resolver actually matches on.
    const content = `<img src="file://${legacyDownloadPath(
      chapterDir,
    )}/0.b64.png">`;
    // When the chapter is prepared for export
    const result = await dropMissingChapterImages(
      content,
      PLUGIN_ID,
      NOVEL_ID,
      CHAPTER_ID,
    );
    // Then it is resolved against the chapter directory, not dropped as foreign
    expect(safExistsMock).toHaveBeenCalledWith(`${chapterDir}/0.b64.png`);
    expect(result).toBe(content);
  });

  it('leaves an absolute image uri outside the chapter directory alone', async () => {
    // Given an absolute uri that points somewhere else entirely
    safExistsMock.mockResolvedValue(false);
    nativeFileExists.mockReturnValue(false);
    const content = '<img src="file:///elsewhere/some/other/0.b64.png">';
    // When the chapter is prepared for export
    const result = await dropMissingChapterImages(
      content,
      PLUGIN_ID,
      NOVEL_ID,
      CHAPTER_ID,
    );
    // Then it is not treated as a chapter-local download that went missing
    expect(safExistsMock).not.toHaveBeenCalled();
    expect(result).toBe(content);
  });
});

/**
 * The download tree is authoritative even when the boot-time permission probe
 * has not settled yet: a read that trusts the cached flag alone skips the tree,
 * misses the legacy location too, and falls through to a source fetch that fails
 * with no network.
 */
describe('chapter reads before the boot permission probe settles', () => {
  beforeEach(() => {
    isSafReadyMock.mockReturnValue(false);
    probeDirectStorageMock.mockReturnValue(true);
    nativeFileExists.mockReturnValue(false);
    nativeFileReadFile.mockReturnValue('');
  });

  it('reads the downloaded chapter out of the tree', async () => {
    // Given/When
    const html = await readDownloadedChapterHtml(chapterIndex);

    // Then the tree wins and the legacy path is never touched.
    expect(safReadFileMock).toHaveBeenCalledWith(chapterIndex);
    expect(html).toBe('<html>downloaded</html>');
  });

  it('reports the chapter as downloaded instead of dropping its image', async () => {
    // Given/When
    const content = await dropMissingChapterImages(
      '<figure><img src="0.b64.png"></figure>',
      PLUGIN_ID,
      NOVEL_ID,
      CHAPTER_ID,
    );

    // Then the image is looked up in the tree and therefore survives.
    expect(safExistsMock).toHaveBeenCalledWith(`${chapterDir}/0.b64.png`);
    expect(content).toBe('<figure><img src="0.b64.png"></figure>');
  });

  it('still falls back to the legacy location when direct access is really gone', async () => {
    // Given no grant at all, and a chapter only the old app-private path has.
    probeDirectStorageMock.mockReturnValue(false);
    nativeFileExists.mockReturnValue(true);
    nativeFileReadFile.mockReturnValue('<html>legacy</html>');

    // When
    const html = await readDownloadedChapterHtml(chapterIndex);

    // Then the tree is skipped and the legacy copy is used.
    expect(safReadFileMock).not.toHaveBeenCalled();
    expect(html).toBe('<html>legacy</html>');
  });
});
