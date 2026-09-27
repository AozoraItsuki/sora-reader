import { importEpub } from '@services/epub/import';

const PLUGIN = 'local';
const NOVEL_ID = 1;
const CHAPTER_ONE = 2;
const CHAPTER_TWO = 3;

type TreeEntry = { data: string; encoding: string };

let mockTree: Map<string, TreeEntry>;
let mockNativeFiles: Map<string, string>;
let mockNovel: Record<string, unknown>;
let mockNextInsertId: number;
let mockCoverUpdates: Array<{ id: number; cover: string }>;

const resetFakes = () => {
  mockTree = new Map();
  mockNativeFiles = new Map();
  mockNextInsertId = 1;
  mockCoverUpdates = [];
  mockNovel = {
    name: 'Imported',
    author: 'a',
    artist: 'b',
    summary: 'c',
    cover: '/epub/OEBPS/images/cover.jpg',
    cssPaths: ['/epub/OEBPS/style/main.css'],
    imagePaths: [
      '/epub/OEBPS/images/a.png',
      '/epub/OEBPS/images/b.png',
      '/epub/OEBPS/images/cover.jpg',
    ],
    chapters: [
      {
        name: 'One',
        path: '/epub/OEBPS/one.xhtml',
        html: '<html><body><img src="../images/a.png"><link href="../style/main.css"></body></html>',
      },
      {
        name: 'Two',
        path: '/epub/OEBPS/two.xhtml',
        html: '<html><body><img src="../images/b.png"></body></html>',
      },
    ],
  };
  for (const path of mockNovel.imagePaths as string[]) {
    mockNativeFiles.set(path, path);
  }
  for (const path of mockNovel.cssPaths as string[]) {
    mockNativeFiles.set(path, path);
  }
  for (const chapter of mockNovel.chapters as Array<{ path: string }>) {
    mockNativeFiles.set(chapter.path, '');
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
  updateNovelInfo: jest.fn().mockImplementation(async (values: { id: number; cover: string }) => {
    mockCoverUpdates.push({ id: values.id, cover: values.cover });
  }),
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

jest.mock('@specs/NativeZipArchive', () => ({
  __esModule: true,
  default: { unzip: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@specs/NativeEpub', () => ({
  __esModule: true,
  default: { parseNovelAndChapters: async () => mockNovel },
}));

jest.mock('@specs/NativeFile', () => ({
  __esModule: true,
  default: {
    getConstants: () => ({ ExternalCachesDirectoryPath: '/cache' }),
    copyFile: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn(),
    exists: (path: string) => mockNativeFiles.has(path),
    readFile: (path: string) => {
      const chapter = (mockNovel.chapters as Array<{ path: string; html: string }>)
        .find(c => c.path === path);
      return chapter ? chapter.html : '';
    },
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: async (path: string) => `base64(${path})`,
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetFakes();
});

const runImport = async () => {
  const meta: { progressText?: string; progress?: number } = {};
  await importEpub({ uri: '/sdcard/book.epub', filename: 'book.epub' }, m => ({
    ...meta,
    ...m,
  }));
};

describe('importEpub asset placement', () => {
  it('stores a tree-relative novel cover', async () => {
    await runImport();

    expect(mockCoverUpdates).toEqual([
      { id: NOVEL_ID, cover: `Novels/${PLUGIN}/${NOVEL_ID}/cover.png` },
    ]);
    expect(mockTree.has(`Novels/${PLUGIN}/${NOVEL_ID}/cover.png`)).toBe(true);
  });

  it('rewrites chapter references to bare filenames', async () => {
    await runImport();

    expect(
      mockTree.get(`Novels/${PLUGIN}/${NOVEL_ID}/${CHAPTER_ONE}/index.html`)
        ?.data,
    ).toBe(
      '<html><body><img src="a.png"><link href="main.css"></body></html>',
    );
  });

  it('places each referenced asset next to its own index.html', async () => {
    await runImport();

    expect(
      mockTree.get(`Novels/${PLUGIN}/${NOVEL_ID}/${CHAPTER_ONE}/a.png`),
    ).toEqual({
      data: 'base64(/epub/OEBPS/images/a.png)',
      encoding: 'base64',
    });
    expect(
      mockTree.get(`Novels/${PLUGIN}/${NOVEL_ID}/${CHAPTER_ONE}/main.css`),
    ).toEqual({
      data: 'base64(/epub/OEBPS/style/main.css)',
      encoding: 'base64',
    });
    expect(
      mockTree.get(`Novels/${PLUGIN}/${NOVEL_ID}/${CHAPTER_TWO}/b.png`),
    ).toEqual({
      data: 'base64(/epub/OEBPS/images/b.png)',
      encoding: 'base64',
    });
  });

  it('does not hoist assets into the novel root', async () => {
    await runImport();

    // The reader anchors a bare src to the chapter directory, so anything left
    // one level up would 404.
    expect(mockTree.has(`Novels/${PLUGIN}/${NOVEL_ID}/a.png`)).toBe(false);
    expect(mockTree.has(`Novels/${PLUGIN}/${NOVEL_ID}/b.png`)).toBe(false);
    expect(mockTree.has(`Novels/${PLUGIN}/${NOVEL_ID}/main.css`)).toBe(false);
  });

  it('skips assets a chapter never references', async () => {
    // Chapter two does not reference the stylesheet.
    await runImport();

    expect(
      mockTree.has(`Novels/${PLUGIN}/${NOVEL_ID}/${CHAPTER_TWO}/main.css`),
    ).toBe(false);
  });
});
