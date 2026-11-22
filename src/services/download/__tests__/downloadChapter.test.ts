import { createElement } from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import { downloadChapter, hasMeaningfulChapterText } from '../downloadChapter';
import NovelScreenList from '../../../screens/novel/components/NovelScreenList';

const CHAPTER_ID = 11;
const NOVEL_ID = 7;
const PLUGIN_ID = 'plugin.test';
const CHAPTER_REL = `Novels/${PLUGIN_ID}/${NOVEL_ID}/${CHAPTER_ID}`;
const INDEX_REL = `${CHAPTER_REL}/index.html`;
const VALID_HTML =
  '<html><body><p>Some real chapter text that is worth saving.</p></body></html>';

// Mutable fakes referenced only from inside deferred mock factories.
let mockChapter: any;
let mockNovel: any;
let mockPlugin: any;
let mockGetChapter: jest.Mock;
let mockSetChapterDownloaded: jest.Mock;
let mockGetNovelById: jest.Mock;
let mockGetPlugin: jest.Mock;
let mockTranslate: jest.Mock;
let mockSafMkdir: jest.Mock;
let mockSafWriteFile: jest.Mock;
let mockSafDownloadFile: jest.Mock;
let mockSafUnlink: jest.Mock;
let mockSafGetFileSize: jest.Mock;
let mockGetMMKVObject: jest.Mock;
let mockDbWrite: jest.Mock;
let mockSetPayloads: any[];
let mockTranslateSettings: any;
let mockNovelValue: jest.Mock;
let mockNovelActions: () => any;
let mockUpdateChapter: jest.Mock;
let mockDownloadingIds: Set<number>;

jest.mock('@database/db', () => ({
  dbManager: { write: (fn: (tx: any) => Promise<void>) => mockDbWrite(fn) },
}));

jest.mock('@database/queries/ChapterQueries', () => ({
  getChapter: (...args: any[]) => mockGetChapter(...args),
  setChapterDownloaded: (...args: any[]) => mockSetChapterDownloaded(...args),
}));

jest.mock('@database/queries/NovelQueries', () => ({
  getNovelById: (...args: any[]) => mockGetNovelById(...args),
  pickCustomNovelCover: jest.fn(),
}));

jest.mock('@database/schema', () => ({
  chapterSchema: { id: 'id', isDownloaded: 'isDownloaded' },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn(() => ({ kind: 'eq' })),
}));

jest.mock('@plugins/pluginManager', () => ({
  getPlugin: (...args: any[]) => mockGetPlugin(...args),
}));

jest.mock('@services/saf/safFile', () => ({
  safMkdir: (...args: any[]) => mockSafMkdir(...args),
  safWriteFile: (...args: any[]) => mockSafWriteFile(...args),
  safDownloadFile: (...args: any[]) => mockSafDownloadFile(...args),
  safUnlink: (...args: any[]) => mockSafUnlink(...args),
  safGetFileSize: (...args: any[]) => mockSafGetFileSize(...args),
}));

jest.mock('@services/translate/TranslateManager', () => ({
  TranslateManager: {
    translateChapterHTML: (...args: any[]) => mockTranslate(...args),
  },
}));

jest.mock('@services/ServiceManager', () => ({}));

jest.mock('../torControl', () => ({
  isCloudflareOrIPBanError: () => false,
  torNewIdentity: jest.fn(),
}));

jest.mock('@utils/DownloadPaths', () => {
  const root = (...parts: any[]) => ['Novels', ...parts].join('/');
  return {
    chapterRel: (p: any, n: any, c: any) => root(p, n, c),
    chapterIndexRel: (p: any, n: any, c: any) => root(p, n, c, 'index.html'),
    chapterImageRel: (p: any, n: any, c: any, i: any) =>
      root(p, n, c, `${i}.b64.png`),
    nomediaRel: (p: any, n: any, c: any) => root(p, n, c, '.nomedia'),
  };
});

jest.mock('@hooks/persisted/useSettings', () => ({
  DOWNLOAD_SETTINGS: 'DOWNLOAD_SETTINGS',
  TRANSLATE_SETTINGS: 'TRANSLATE_SETTINGS',
  initialDownloadSettings: { proxy: { mode: 'direct' } },
  initialTranslateSettings: { downloadTranslated: false },
}));

jest.mock('@hooks/persisted/useAIProviders', () => ({
  ACTIVE_AI_PROVIDER_KEY: 'ACTIVE_AI_PROVIDER_KEY',
  AI_PROVIDERS_KEY: 'AI_PROVIDERS_KEY',
}));

jest.mock('@utils/mmkv/mmkv', () => ({
  getMMKVObject: (...args: any[]) => mockGetMMKVObject(...args),
}));

jest.mock('@strings/translations', () => ({
  getString: (key: string) => key,
}));

jest.mock('@utils/showToast', () => ({
  showToast: jest.fn(),
}));

// --- Minimal environment for the NovelScreenList queue-removal effect -------

jest.mock('../../../screens/novel/NovelContext', () => ({
  useNovelValue: (key: string) => mockNovelValue(key),
  useNovelActions: () => mockNovelActions(),
}));

jest.mock('@hooks/persisted', () => ({
  useAppSettings: () => ({
    useFabForContinueReading: false,
    disableHapticFeedback: true,
    downloadNewChapters: false,
    refreshNovelMetadata: false,
  }),
  useDownload: () => ({
    downloadingChapterIds: mockDownloadingIds,
    downloadChapter: jest.fn(),
    cancelChapterDownload: jest.fn(),
  }),
  useTheme: () => ({
    primary: '#111',
    onPrimary: '#fff',
    surface2: '#222',
  }),
}));

jest.mock('@hooks/index', () => ({
  useBoolean: () => ({ value: false, setTrue: jest.fn(), setFalse: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock('@legendapp/list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LegendList: ({ data, renderItem, ListHeaderComponent }: any) =>
      React.createElement(
        View,
        null,
        ListHeaderComponent,
        ...(data || []).map((item: any, index: number) =>
          React.createElement(
            React.Fragment,
            { key: `row-${item.id ?? index}` },
            renderItem({ item, index }),
          ),
        ),
      ),
  };
});

jest.mock('../../../screens/novel/components/ChapterItem', () => {
  const React = require('react');
  const { View } = require('react-native');
  return ({ chapter }: any) =>
    React.createElement(View, { testID: `chapter-item-${chapter.id}` });
});

jest.mock('../../../screens/novel/components/Info/NovelInfoHeader', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => React.createElement(Text, null, 'hdr');
});

jest.mock(
  '../../../screens/novel/components/PagePaginationControl',
  () => () => null,
);

jest.mock(
  '../../../screens/novel/components/NovelBottomSheet',
  () => () => null,
);
jest.mock(
  '../../../screens/novel/components/PageNavigationBottomSheet',
  () => () => null,
);

jest.mock('react-native-paper', () => ({
  AnimatedFAB: () => null,
}));

jest.mock('@components/Skeleton/Skeleton', () => ({
  ChapterListSkeleton: () => null,
}));

jest.mock('@services/updates/LibraryUpdateQueries', () => ({
  updateNovel: jest.fn(),
  updateNovelPage: jest.fn(),
}));

jest.mock('@specs/NativeFile', () => ({
  getConstants: () => ({ ExternalCachesDirectoryPath: '/tmp' }),
  copyFile: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('@plugins/helpers/fetch', () => ({ downloadFile: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(),
  },
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

let meta: { isRunning: boolean; progress: number };
const setMeta = (transformer: (m: typeof meta) => typeof meta) => {
  meta = transformer(meta);
};
const runDownload = (signal?: AbortSignal) =>
  downloadChapter({ chapterId: CHAPTER_ID }, setMeta as any, signal);

const writtenIndexHtml = (): string => {
  const call = mockSafWriteFile.mock.calls.find(([rel]) => rel === INDEX_REL);
  return call ? String(call[1]) : '';
};

describe('hasMeaningfulChapterText', () => {
  it.each([
    ['empty string', ''],
    ['whitespace only', '   \n\t  '],
    ['empty body', '<html><body></body></html>'],
    ['tag only', '<div><span>   </span></div>'],
    [
      'script/style only',
      '<script>var a = 1;</script><style>p{color:red}</style>',
    ],
    [
      'short scrape error',
      '<html><body>Error: Chapter not found</body></html>',
    ],
  ])('rejects %s', (_label, html) => {
    expect(hasMeaningfulChapterText(html)).toBe(false);
  });

  it('accepts html with visible chapter text', () => {
    expect(hasMeaningfulChapterText(VALID_HTML)).toBe(true);
  });

  it('accepts image-only chapters', () => {
    expect(
      hasMeaningfulChapterText('<img src="https://example.com/ch1.png" />'),
    ).toBe(true);
  });

  it('accepts template wrapped chapter text', () => {
    expect(
      hasMeaningfulChapterText(
        '<template><p>Legitimate chapter text inside template</p></template>',
      ),
    ).toBe(true);
  });

  it('accepts chapter with image and short title', () => {
    expect(
      hasMeaningfulChapterText(
        '<h1>Ch 1</h1><img src="https://example.com/ch1.png" />',
      ),
    ).toBe(true);
  });

  it('rejects error sentinel even if accompanied by logo image', () => {
    expect(
      hasMeaningfulChapterText(
        '<html><body><img src="/cf-logo.png"/><p>Access denied</p></body></html>',
      ),
    ).toBe(false);
  });
});

describe('downloadChapter atomic persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    meta = { isRunning: false, progress: 0 };
    mockChapter = {
      id: CHAPTER_ID,
      novelId: NOVEL_ID,
      name: 'Chapter 11',
      path: '/chapter/11',
      isDownloaded: false,
    };
    mockNovel = { id: NOVEL_ID, pluginId: PLUGIN_ID, name: 'Novel' };
    mockPlugin = {
      id: PLUGIN_ID,
      site: 'https://example.com',
      imageRequestInit: {},
      parseChapter: jest.fn().mockResolvedValue(VALID_HTML),
    };
    mockGetChapter = jest.fn().mockResolvedValue(mockChapter);
    mockGetNovelById = jest.fn().mockResolvedValue(mockNovel);
    mockGetPlugin = jest.fn().mockReturnValue(mockPlugin);
    mockTranslate = jest.fn().mockImplementation(async (html: string) => html);
    mockSafMkdir = jest.fn().mockResolvedValue(true);
    mockSafWriteFile = jest.fn().mockResolvedValue(true);
    mockSafDownloadFile = jest.fn().mockResolvedValue(true);
    mockSafUnlink = jest.fn().mockResolvedValue(true);
    mockSafGetFileSize = jest.fn().mockResolvedValue(512);
    mockSetChapterDownloaded = jest.fn().mockResolvedValue(undefined);
    mockTranslateSettings = { downloadTranslated: false };
    mockGetMMKVObject = jest.fn((key: string) =>
      key === 'TRANSLATE_SETTINGS' ? mockTranslateSettings : undefined,
    );
    mockSetPayloads = [];
    const setMock = jest.fn((payload: any) => {
      mockSetPayloads.push(payload);
      return {
        where: jest.fn(() => ({ run: jest.fn().mockResolvedValue(undefined) })),
      };
    });
    mockDbWrite = jest.fn(async (fn: (tx: any) => Promise<void>) => {
      await fn({ update: jest.fn(() => ({ set: setMock })) });
    });
  });

  it('rejects a whitespace-only parse result without writing files or setting the flag', async () => {
    mockPlugin.parseChapter.mockResolvedValue('   \n\t  ');

    await expect(runDownload()).rejects.toThrow('chapterEmptyOrScrapeError');

    expect(mockSafMkdir).not.toHaveBeenCalled();
    expect(mockSafWriteFile).not.toHaveBeenCalled();
    expect(mockDbWrite).not.toHaveBeenCalled();
    expect(mockSetPayloads).toEqual([]);
    expect(mockSetChapterDownloaded).toHaveBeenCalledWith(CHAPTER_ID, false);
    expect(meta.isRunning).toBe(false);
  });

  it('rejects an error-sentinel parse result', async () => {
    mockPlugin.parseChapter.mockResolvedValue(
      '<html><body>Access denied</body></html>',
    );

    await expect(runDownload()).rejects.toThrow('chapterEmptyOrScrapeError');
    expect(mockDbWrite).not.toHaveBeenCalled();
  });

  it('rejects a silently empty translation and passes the signal into translation', async () => {
    mockTranslateSettings = { downloadTranslated: true };
    mockTranslate.mockResolvedValue('<html><body>   </body></html>');

    await expect(runDownload()).rejects.toThrow('chapterEmptyOrScrapeError');

    expect(mockTranslate).toHaveBeenCalledWith(
      VALID_HTML,
      expect.objectContaining({ downloadTranslated: true }),
      undefined,
      undefined,
    );
    expect(mockSafWriteFile).not.toHaveBeenCalled();
    expect(mockDbWrite).not.toHaveBeenCalled();
    expect(mockSetChapterDownloaded).toHaveBeenCalledWith(CHAPTER_ID, false);
    expect(meta.isRunning).toBe(false);
  });

  it('does not fall back to untranslated text when translation is aborted', async () => {
    mockTranslateSettings = { downloadTranslated: true };
    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    mockTranslate.mockRejectedValue(abortError);

    await expect(runDownload()).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mockSafMkdir).not.toHaveBeenCalled();
    expect(mockDbWrite).not.toHaveBeenCalled();
    expect(meta.isRunning).toBe(false);
  });

  it('removes the partially written folder and rethrows when a write fails', async () => {
    mockSafWriteFile.mockImplementation(async (rel: string) => {
      if (rel === INDEX_REL) {
        throw new Error('disk full');
      }
      return true;
    });

    await expect(runDownload()).rejects.toThrow('disk full');

    expect(mockSafUnlink).toHaveBeenCalledWith(CHAPTER_REL);
    expect(mockDbWrite).not.toHaveBeenCalled();
    expect(mockSetChapterDownloaded).toHaveBeenCalledWith(CHAPTER_ID, false);
    expect(meta.isRunning).toBe(false);
  });

  it('removes the partially written folder when the download is aborted mid-write', async () => {
    const controller = new AbortController();
    mockSafMkdir.mockImplementation(async () => {
      controller.abort();
      return true;
    });

    await expect(runDownload(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(mockSafUnlink).toHaveBeenCalledWith(CHAPTER_REL);
    expect(mockDbWrite).not.toHaveBeenCalled();
    expect(meta.isRunning).toBe(false);
  });

  it('does not persist the flag when the written index has zero bytes', async () => {
    mockSafGetFileSize.mockResolvedValue(0);

    await expect(runDownload()).rejects.toThrow('chapterEmptyOrScrapeError');

    expect(mockSafGetFileSize).toHaveBeenCalledWith(INDEX_REL);
    expect(mockSafUnlink).toHaveBeenCalledWith(CHAPTER_REL);
    expect(mockDbWrite).not.toHaveBeenCalled();
    expect(meta.isRunning).toBe(false);
  });

  it('sets the DB flag only after a non-empty index was verified', async () => {
    await expect(runDownload()).resolves.toBeUndefined();

    expect(mockSafWriteFile).toHaveBeenCalledWith(
      INDEX_REL,
      expect.stringContaining('Some real chapter text'),
    );
    expect(mockSafGetFileSize).toHaveBeenCalledWith(INDEX_REL);
    expect(mockSetPayloads).toEqual([{ isDownloaded: true }]);
    expect(mockSetChapterDownloaded).not.toHaveBeenCalled();
    expect(meta).toEqual({ isRunning: false, progress: 1 });
  });

  it('keeps image failures non-fatal with the original src and an alt reason', async () => {
    mockPlugin.parseChapter.mockResolvedValue(
      '<html><body><img src="https://example.com/a.png"/><p>Chapter text</p></body></html>',
    );
    mockSafDownloadFile.mockRejectedValue(new Error('no network'));

    await expect(runDownload()).resolves.toBeUndefined();

    expect(writtenIndexHtml()).toContain('https://example.com/a.png');
    expect(writtenIndexHtml()).toContain('alt="Error: no network"');
    expect(mockSafUnlink).not.toHaveBeenCalled();
    expect(mockSetPayloads).toEqual([{ isDownloaded: true }]);
  });
});

describe('NovelScreenList download flag sync', () => {
  const chapter = {
    id: CHAPTER_ID,
    novelId: NOVEL_ID,
    name: 'Chapter 11',
    path: '/chapter/11',
    isDownloaded: false,
  };
  const novel = {
    id: NOVEL_ID,
    name: 'Novel',
    path: '/novel/test',
    pluginId: PLUGIN_ID,
    cover: null,
  };
  const props = {
    headerOpacity: { set: jest.fn() },
    listRef: { current: null },
    navigation: { navigate: jest.fn() },
    routeBaseNovel: {
      name: 'Novel',
      path: '/novel/test',
      pluginId: PLUGIN_ID,
    },
    selected: [] as any[],
    setSelected: jest.fn(),
  };
  const renderList = () => render(createElement(NovelScreenList, props as any));

  beforeEach(() => {
    jest.clearAllMocks();
    mockDownloadingIds = new Set<number>();
    mockUpdateChapter = jest.fn();
    mockGetChapter = jest.fn().mockResolvedValue(chapter);
    const values: Record<string, any> = {
      chapters: [chapter],
      fetching: false,
      firstUnreadChapter: undefined,
      loading: false,
      pages: ['1'],
      novel,
      batchInformation: { totalChapters: 1 },
      novelSettings: { filter: [] },
      pageIndex: 0,
      lastRead: undefined,
    };
    mockNovelValue = jest.fn((key: string) => values[key]);
    mockNovelActions = () => ({
      deleteChapter: jest.fn(),
      setNovel: jest.fn(),
      getNextChapter: jest.fn(),
      openPage: jest.fn(),
      updateChapter: mockUpdateChapter,
      refreshNovel: jest.fn(),
      markChapterRead: jest.fn(),
      markChaptersUnread: jest.fn(),
      bookmarkChapters: jest.fn(),
    });
  });

  const finishDownload = (view: ReturnType<typeof renderList>) => {
    mockDownloadingIds = new Set<number>();
    act(() => {
      view.rerender(
        createElement(NovelScreenList, {
          ...props,
          setSelected: jest.fn(),
        } as any),
      );
    });
  };

  it('does not flip the list flag when queue removal is not backed by the DB', async () => {
    mockGetChapter.mockResolvedValue({ ...chapter, isDownloaded: false });
    mockDownloadingIds = new Set<number>([CHAPTER_ID]);

    const view = renderList();
    finishDownload(view);

    await waitFor(() =>
      expect(mockGetChapter).toHaveBeenCalledWith(CHAPTER_ID),
    );
    expect(mockUpdateChapter).not.toHaveBeenCalled();
  });

  it('flips the list flag once the DB confirms the download', async () => {
    mockGetChapter.mockResolvedValue({ ...chapter, isDownloaded: true });
    mockDownloadingIds = new Set<number>([CHAPTER_ID]);

    const view = renderList();
    finishDownload(view);

    await waitFor(() =>
      expect(mockUpdateChapter).toHaveBeenCalledWith(0, {
        isDownloaded: true,
      }),
    );
  });
});
