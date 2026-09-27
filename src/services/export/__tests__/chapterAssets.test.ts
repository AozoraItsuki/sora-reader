import { isSafReady, safExists } from '@services/saf/safFile';
import NativeFile from '@specs/NativeFile';

import { dropMissingChapterImages } from '../chapterAssets';

jest.mock('@services/saf/safFile', () => ({
  isSafReady: jest.fn(() => true),
  safExists: jest.fn(async () => true),
}));

const isSafReadyMock = isSafReady as jest.MockedFunction<typeof isSafReady>;
const safExistsMock = safExists as jest.MockedFunction<typeof safExists>;
const nativeFileExists = NativeFile.exists as jest.MockedFunction<
  typeof NativeFile.exists
>;

const PLUGIN_ID = 'novelupdates';
const NOVEL_ID = 7;
const CHAPTER_ID = 42;

const chapterDir = `Novels/${PLUGIN_ID}/${NOVEL_ID}/${CHAPTER_ID}`;

beforeEach(() => {
  isSafReadyMock.mockReturnValue(true);
  safExistsMock.mockResolvedValue(true);
  nativeFileExists.mockReturnValue(true);
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
    // Given a legacy absolute image uri pointing into this chapter
    const content = `<img src="file:///mock/novels/${chapterDir}/0.b64.png">`;
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
});
