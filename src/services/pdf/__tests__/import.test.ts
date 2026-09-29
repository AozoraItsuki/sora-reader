import { importPdf } from '@services/pdf/import';

const PLUGIN = 'local';
const NOVEL_ID = 1;
const PAGE_ONE_CHAPTER = 2;
const PAGE_TWO_CHAPTER = 3;
const PAGE_IMAGE = '0.b64.png';

type TreeEntry = { data: string; encoding: string };
type ParsedPage = { pageNumber: number; text: string; imagePath: string };

const novelDir = `Novels/${PLUGIN}/${NOVEL_ID}`;
const chapterDir = (chapterId: number) => `${novelDir}/${chapterId}`;

let mockTree: Map<string, TreeEntry>;
let mockNativeFiles: Map<string, string>;
let mockPdf: {
  title: string;
  author: string;
  cover: string | null;
  pages: ParsedPage[];
};
let mockNextInsertId: number;
let mockNovelUpdates: Array<{
  id: number;
  name: string;
  author: string;
  cover: string;
}>;
let mockCopyFile: jest.Mock;

const resetFakes = () => {
  mockTree = new Map();
  mockNativeFiles = new Map();
  mockNextInsertId = 1;
  mockNovelUpdates = [];
  mockCopyFile = jest.fn();
  mockPdf = {
    title: 'Doc Title',
    author: 'Doc Author',
    cover: '/cache/pdf/page-1.png',
    pages: [
      {
        pageNumber: 1,
        text: 'First page text',
        imagePath: '/cache/pdf/page-1.png',
      },
      {
        pageNumber: 2,
        text: 'Second page text',
        imagePath: '/cache/pdf/page-2.png',
      },
    ],
  };
  for (const page of mockPdf.pages) {
    mockNativeFiles.set(page.imagePath, page.imagePath);
  }
};

jest.mock('@utils/Storages', () => ({
  ROOT_STORAGE: '/root',
  PLUGIN_STORAGE: '/root/Plugins',
  NOVEL_STORAGE: '/root/Novels',
}));

jest.mock('@strings/translations', () => ({
  getString: (key: string) => key,
}));

jest.mock('@plugins/pluginManager', () => ({
  LOCAL_PLUGIN_ID: 'local',
}));

jest.mock('@database/queries/NovelQueries', () => ({
  updateNovelCategoryById: jest.fn().mockResolvedValue(undefined),
  updateNovelInfo: jest
    .fn()
    .mockImplementation(
      async (values: {
        id: number;
        name: string;
        author: string;
        cover: string;
      }) => {
        mockNovelUpdates.push({
          id: values.id,
          name: values.name,
          author: values.author,
          cover: values.cover,
        });
      },
    ),
}));

jest.mock('@database/db', () => ({
  dbManager: {
    write: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        insert: () => ({
          values: () => ({
            run: async () => ({ insertId: mockNextInsertId++ }),
          }),
        }),
      }),
  },
}));

jest.mock('@services/saf/safFile', () => ({
  safMkdir: async (rel: string) => {
    mockTree.set(`${rel}/`, { data: '', encoding: 'dir' });
    return true;
  },
  safWriteFile: async (rel: string, data: string, encoding = 'utf8') => {
    mockTree.set(rel, { data, encoding });
    return true;
  },
}));

jest.mock('@specs/NativePdf', () => ({
  __esModule: true,
  default: { parse: async () => mockPdf },
}));

jest.mock('@specs/NativeFile', () => ({
  __esModule: true,
  default: {
    getConstants: () => ({ ExternalCachesDirectoryPath: '/cache' }),
    copyFile: (...args: unknown[]) => mockCopyFile(...args),
    mkdir: jest.fn(),
    unlink: jest.fn(),
    exists: (path: string) => mockNativeFiles.has(path),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  // The real module rejects a bare path with "Unsupported scheme", so an
  // importer that forgets the `file://` prefix fails here instead of on device.
  readAsStringAsync: async (uri: string) => {
    if (!uri.startsWith('file://')) {
      throw new Error(`Unsupported scheme: ${uri}`);
    }
    return `base64(${uri})`;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetFakes();
});

const runImport = async () => {
  const meta: { progressText?: string; progress?: number } = {};
  await importPdf({ uri: '/sdcard/book.pdf', filename: 'book.pdf' }, m => ({
    ...meta,
    ...m,
  }));
};

describe('importPdf page placement', () => {
  it('copies the picked pdf into the app cache before parsing', async () => {
    await runImport();

    expect(mockCopyFile).toHaveBeenCalledWith(
      '/sdcard/book.pdf',
      '/cache/novel.pdf',
    );
  });

  it('creates one chapter per pdf page', async () => {
    await runImport();

    expect(mockTree.has(`${chapterDir(PAGE_ONE_CHAPTER)}/index.html`)).toBe(
      true,
    );
    expect(mockTree.has(`${chapterDir(PAGE_TWO_CHAPTER)}/index.html`)).toBe(
      true,
    );
    // A two-page pdf must not create a third chapter.
    expect(mockTree.has(`${chapterDir(4)}/index.html`)).toBe(false);
  });

  it('writes each page image next to its own index.html', async () => {
    await runImport();

    expect(
      mockTree.get(`${chapterDir(PAGE_ONE_CHAPTER)}/${PAGE_IMAGE}`),
    ).toEqual({
      data: 'base64(file:///cache/pdf/page-1.png)',
      encoding: 'base64',
    });
    expect(
      mockTree.get(`${chapterDir(PAGE_TWO_CHAPTER)}/${PAGE_IMAGE}`),
    ).toEqual({
      data: 'base64(file:///cache/pdf/page-2.png)',
      encoding: 'base64',
    });
  });

  it('does not hoist page images into the novel root', async () => {
    await runImport();

    // The reader anchors a bare src to the chapter directory, so a page image
    // left directly in the novel root is an unreachable second copy. Assert on
    // the whole root listing rather than on one name, so hoisting under any
    // other name still fails.
    const rootFiles = Array.from(mockTree.keys()).filter(
      rel =>
        rel.startsWith(`${novelDir}/`) &&
        !rel.endsWith('/') &&
        !rel.slice(`${novelDir}/`.length).includes('/'),
    );
    expect(rootFiles).toEqual([`${novelDir}/cover.png`]);
  });

  it('references the page image by a bare filename', async () => {
    await runImport();

    const html = mockTree.get(
      `${chapterDir(PAGE_ONE_CHAPTER)}/index.html`,
    )?.data;
    expect(html).toContain(`src="${PAGE_IMAGE}"`);
    expect(html).not.toContain('page-1.png');
  });

  it('embeds the extracted page text in the chapter document', async () => {
    await runImport();

    const html = mockTree.get(
      `${chapterDir(PAGE_TWO_CHAPTER)}/index.html`,
    )?.data;
    expect(html).toContain('Second page text');
  });

  it('escapes html in the extracted page text', async () => {
    // Given: a page whose text contains markup.
    mockPdf.pages[0].text = '<script>alert(1)</script>';

    // When:
    await runImport();

    // Then: the text is inert, not executable markup.
    const html = mockTree.get(
      `${chapterDir(PAGE_ONE_CHAPTER)}/index.html`,
    )?.data;
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('importPdf metadata', () => {
  it('stores the parsed title and author', async () => {
    await runImport();

    expect(mockNovelUpdates).toEqual([
      {
        id: NOVEL_ID,
        name: 'Doc Title',
        author: 'Doc Author',
        cover: `${novelDir}/cover.png`,
      },
    ]);
  });

  it('falls back to the picked filename when the pdf has no title', async () => {
    // Given: a pdf whose document info carries no title.
    mockPdf.title = '';

    // When:
    await runImport();

    // Then: the novel is still named from the file.
    expect(mockNovelUpdates[0]?.name).toBe('book');
  });

  it('uses the first page render as the novel cover', async () => {
    await runImport();

    expect(mockTree.get(`${novelDir}/cover.png`)).toEqual({
      data: 'base64(file:///cache/pdf/page-1.png)',
      encoding: 'base64',
    });
  });
});

describe('importPdf failure handling', () => {
  it('rejects when the picked pdf cannot be copied into the cache', async () => {
    // Given: a picker uri that no longer resolves to a readable file.
    mockCopyFile.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    // When / Then: the task fails with the file it could not read.
    await expect(runImport()).rejects.toThrow(/book\.pdf/);
  });

  it('skips a page whose image render is missing from the cache', async () => {
    // Given: a page the native side failed to rasterize.
    mockNativeFiles.delete('/cache/pdf/page-2.png');

    // When:
    await runImport();

    // Then: the chapter document is still written.
    expect(mockTree.has(`${chapterDir(PAGE_TWO_CHAPTER)}/index.html`)).toBe(
      true,
    );
    expect(mockTree.has(`${chapterDir(PAGE_TWO_CHAPTER)}/${PAGE_IMAGE}`)).toBe(
      false,
    );
  });
});
