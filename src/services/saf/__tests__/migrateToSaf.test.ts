import {
  _legacyAbsPath,
  hasLegacyDownloads,
  relativizeCoverPath,
  rewriteChapterHtml,
  runSafMigration,
} from '@services/saf/migrateToSaf';

const OLD_ROOT = '/root/Novels';

type LegacyFile = string;
type NovelRow = { id: number; pluginId: string; cover: string | null };
type ChapterRow = { id: number; novelId: number };
type TreeEntry = { data: string; encoding: string };

// ---------------------------------------------------------------------------
// Fakes. Every jest.mock factory below only *references* these bindings from
// inside deferred arrow functions, so they are safe to initialise in beforeEach.
// ---------------------------------------------------------------------------

let mockLegacyFiles: Map<string, LegacyFile>;
let mockLegacyUnlinked: string[];
let mockTree: Map<string, TreeEntry>;
let mockNovels: NovelRow[];
let mockDownloadedChapters: ChapterRow[];
let mockCoverUpdates: Array<{ id: number; cover: string }>;
let mockPermissionGranted: boolean;
let mockTreeUri: string | null;
let mockMigrationDone: boolean;
let mockLogEntries: string[];
let mockFailWriteFor: (rel: string) => boolean;

const resetFakes = () => {
  mockLegacyFiles = new Map();
  mockLegacyUnlinked = [];
  mockTree = new Map();
  mockNovels = [];
  mockDownloadedChapters = [];
  mockCoverUpdates = [];
  mockPermissionGranted = true;
  mockTreeUri = 'content://downloads/tree';
  mockMigrationDone = false;
  mockLogEntries = [];
  mockFailWriteFor = () => false;
};

jest.mock('@utils/Storages', () => ({
  ROOT_STORAGE: '/root',
  PLUGIN_STORAGE: '/root/Plugins',
  NOVEL_STORAGE: '/root/Novels',
}));

jest.mock('@services/DebugLogService', () => ({
  __esModule: true,
  default: {
    addEntry: (_level: string, message: string) => {
      mockLogEntries.push(message);
    },
  },
}));

jest.mock('@specs/NativeFile', () => ({
  __esModule: true,
  default: {
    exists: (path: string) => {
      if (mockLegacyFiles.has(path)) {
        return true;
      }
      for (const file of mockLegacyFiles.keys()) {
        if (file.startsWith(`${path}/`)) {
          return true;
        }
      }
      return false;
    },
    readFile: (path: string) => mockLegacyFiles.get(path) ?? '',
    readDir: (dir: string) => {
      const seen = new Map<string, boolean>();
      for (const file of mockLegacyFiles.keys()) {
        if (!file.startsWith(`${dir}/`)) {
          continue;
        }
        const rest = file.slice(dir.length + 1);
        const segment = rest.split('/')[0];
        if (!seen.has(segment)) {
          seen.set(segment, rest.includes('/'));
        }
      }
      return Array.from(seen.entries()).map(([name, isDirectory]) => ({
        name,
        path: `${dir}/${name}`,
        isDirectory,
      }));
    },
    unlink: (path: string) => {
      mockLegacyUnlinked.push(path);
      for (const file of Array.from(mockLegacyFiles.keys())) {
        if (file === path || file.startsWith(`${path}/`)) {
          mockLegacyFiles.delete(file);
        }
      }
    },
  },
}));

jest.mock('@services/saf/safFile', () => ({
  isSafMigrationDone: () => mockMigrationDone,
  markSafMigrationDone: () => {
    mockMigrationDone = true;
  },
  ensureSafPermission: async () => mockPermissionGranted,
  getSafTreeUri: () => mockTreeUri,
  safExists: async (rel: string) => mockTree.has(rel),
  safMkdir: async () => true,
  safWriteFile: async (rel: string, data: string, encoding = 'utf8') => {
    if (mockFailWriteFor(rel)) {
      throw new Error(`write failed: ${rel}`);
    }
    mockTree.set(rel, { data, encoding });
    return true;
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: async (path: string) => `base64(${path})`,
}));

// The migration only ever selects the novel table (which carries `pluginId`) and
// the chapter table, and only ever updates a cover, so the fakes dispatch on the
// requested columns instead of the drizzle table identity.
jest.mock('@database/db', () => ({
  dbManager: {
    select: (columns: Record<string, unknown>) => {
      const query: Record<string, unknown> = {};
      let isNovelTable = false;
      query.from = () => {
        isNovelTable = Object.prototype.hasOwnProperty.call(
          columns,
          'pluginId',
        );
        return query;
      };
      query.where = () => query;
      query.all = async () =>
        isNovelTable
          ? mockNovels.map(novel => ({ ...novel }))
          : mockDownloadedChapters.map(chapter => ({ ...chapter }));
      return query;
    },
    write: async (cb: (tx: unknown) => Promise<void>) =>
      cb({
        update: () => ({
          set: (values: { cover: string }) => ({
            where: () => ({
              run: async () => {
                mockCoverUpdates.push({ id: 1, cover: values.cover });
              },
            }),
          }),
        }),
      }),
  },
}));

const seedLegacyNovel = (novel: NovelRow, chapters: ChapterRow[]) => {
  mockNovels = [novel];
  mockDownloadedChapters = chapters;
  mockLegacyFiles.set(
    `${OLD_ROOT}/${novel.pluginId}/${novel.id}/cover.png`,
    'JPEG',
  );
  for (const chapter of chapters) {
    const dir = `${OLD_ROOT}/${novel.pluginId}/${novel.id}/${chapter.id}`;
    mockLegacyFiles.set(
      `${dir}/index.html`,
      `<html><body><img src="file://${dir}/3.b64.png"></body></html>`,
    );
    mockLegacyFiles.set(`${dir}/3.b64.png`, 'PNGDATA');
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  resetFakes();
});

describe('rewriteChapterHtml', () => {
  it('rewrites an absolute legacy img src to a bare filename', () => {
    const html = `<img src="file://${OLD_ROOT}/p1/1/5/3.b64.png">`;
    expect(rewriteChapterHtml(html, OLD_ROOT)).toBe('<img src="3.b64.png">');
  });

  it('leaves already-relative srcs alone', () => {
    const html = '<img src="3.b64.png">';
    expect(rewriteChapterHtml(html, OLD_ROOT)).toBe(html);
  });

  it('collapses other absolute legacy references to their basename', () => {
    const html = `<link href="file://${OLD_ROOT}/p1/1/style.css">`;
    expect(rewriteChapterHtml(html, OLD_ROOT)).toBe('<link href="style.css">');
  });

  it('does not touch remote references', () => {
    const html = '<img src="https://example.com/a.png">';
    expect(rewriteChapterHtml(html, OLD_ROOT)).toBe(html);
  });
});

describe('relativizeCoverPath', () => {
  it('maps a legacy absolute cover onto the tree', () => {
    expect(
      relativizeCoverPath(`file://${OLD_ROOT}/p1/1/cover.png`, OLD_ROOT),
    ).toBe('Novels/p1/1/cover.png');
  });

  it('tolerates being handed ROOT_STORAGE instead of NOVEL_STORAGE', () => {
    expect(
      relativizeCoverPath('file:///root/Novels/p1/1/cover.png', '/root'),
    ).toBe('Novels/p1/1/cover.png');
  });

  it('drops the cache-buster from a legacy cover', () => {
    expect(
      relativizeCoverPath(`file://${OLD_ROOT}/p1/1/cover.png?12345`, OLD_ROOT),
    ).toBe('Novels/p1/1/cover.png');
  });

  it('keeps a remote cover exactly as stored', () => {
    const remote = 'https://example.com/cover.png?12345';
    expect(relativizeCoverPath(remote, OLD_ROOT)).toBe(remote);
  });

  it('passes an already-relative cover through', () => {
    expect(relativizeCoverPath('Novels/p1/1/cover.png', OLD_ROOT)).toBe(
      'Novels/p1/1/cover.png',
    );
  });
});

describe('_legacyAbsPath', () => {
  it('strips the Novels segment before joining the legacy root', () => {
    expect(_legacyAbsPath(OLD_ROOT, 'Novels/p1/1/cover.png')).toBe(
      `${OLD_ROOT}/p1/1/cover.png`,
    );
  });
});

describe('hasLegacyDownloads', () => {
  it('returns false when the legacy root is absent', () => {
    expect(hasLegacyDownloads()).toBe(false);
  });

  it('returns true when a legacy file exists under the root', () => {
    mockLegacyFiles.set('/root/Novels/en/1/cover.png', 'png');
    expect(hasLegacyDownloads()).toBe(true);
  });

  it('returns false when NativeFile throws', () => {
    mockLegacyFiles.set('/root/Novels/en/1/cover.png', 'png');
    const spy = jest
      .spyOn(require('@specs/NativeFile').default, 'exists')
      .mockImplementationOnce(() => {
        throw new Error('boom');
      });
    try {
      expect(hasLegacyDownloads()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('runSafMigration', () => {
  it('does nothing when the migration is already marked done', async () => {
    mockMigrationDone = true;
    mockLegacyFiles.set(`${OLD_ROOT}/p1/1/cover.png`, 'JPEG');

    await runSafMigration();

    expect(mockTree.size).toBe(0);
    expect(mockLegacyFiles.size).toBe(1);
  });

  it('skips without marking done when SAF permission is missing', async () => {
    mockPermissionGranted = false;
    seedLegacyNovel(
      { id: 1, pluginId: 'p1', cover: `file://${OLD_ROOT}/p1/1/cover.png` },
      [{ id: 5, novelId: 1 }],
    );

    await runSafMigration();

    expect(mockTree.size).toBe(0);
    expect(mockLegacyFiles.size).toBeGreaterThan(0);
    expect(mockMigrationDone).toBe(false);
  });

  it('marks done immediately when there is no legacy storage', async () => {
    await runSafMigration();

    expect(mockMigrationDone).toBe(true);
    expect(mockTree.size).toBe(0);
  });

  it('migrates chapters, rewrites html and relativises the cover', async () => {
    seedLegacyNovel(
      { id: 1, pluginId: 'p1', cover: `file://${OLD_ROOT}/p1/1/cover.png` },
      [{ id: 5, novelId: 1 }],
    );

    await runSafMigration();

    // index.html rewritten to a bare src, stored as utf8 text.
    expect(mockTree.get('Novels/p1/1/5/index.html')).toEqual({
      data: '<html><body><img src="3.b64.png"></body></html>',
      encoding: 'utf8',
    });
    // The image payload is copied verbatim as base64.
    expect(mockTree.get('Novels/p1/1/5/3.b64.png')).toEqual({
      data: `base64(${OLD_ROOT}/p1/1/5/3.b64.png)`,
      encoding: 'base64',
    });
    expect(mockTree.get('Novels/p1/1/cover.png')).toEqual({
      data: `base64(${OLD_ROOT}/p1/1/cover.png)`,
      encoding: 'base64',
    });

    // The DB now holds a tree-relative cover with no file:// scheme.
    expect(mockCoverUpdates).toEqual([
      { id: 1, cover: 'Novels/p1/1/cover.png' },
    ]);

    // Legacy storage is gone and the run is closed out.
    expect(mockLegacyFiles.size).toBe(0);
    expect(mockLegacyUnlinked).toContain(OLD_ROOT);
    expect(mockMigrationDone).toBe(true);
  });

  it('leaves the DB cover alone when it is already relative', async () => {
    seedLegacyNovel({ id: 1, pluginId: 'p1', cover: 'Novels/p1/1/cover.png' }, [
      { id: 5, novelId: 1 },
    ]);

    await runSafMigration();

    expect(mockCoverUpdates).toEqual([]);
    expect(mockMigrationDone).toBe(true);
  });

  it('never throws when a chapter fails, and keeps its legacy data', async () => {
    seedLegacyNovel(
      { id: 1, pluginId: 'p1', cover: `file://${OLD_ROOT}/p1/1/cover.png` },
      [{ id: 5, novelId: 1 }],
    );
    mockFailWriteFor = rel => rel === 'Novels/p1/1/5/index.html';

    await expect(runSafMigration()).resolves.toBeUndefined();

    // The failed chapter keeps its legacy folder, so the image survives and the
    // novel directory is NOT wiped by the cover migration.
    expect(mockLegacyFiles.has(`${OLD_ROOT}/p1/1/5/3.b64.png`)).toBe(true);
    expect(mockLegacyUnlinked).not.toContain(`${OLD_ROOT}/p1/1`);
    expect(mockLegacyUnlinked).not.toContain(OLD_ROOT);

    // The cover still migrated, and the run stays open for the next attempt.
    expect(mockTree.has('Novels/p1/1/cover.png')).toBe(true);
    expect(mockCoverUpdates).toEqual([
      { id: 1, cover: 'Novels/p1/1/cover.png' },
    ]);
    expect(mockMigrationDone).toBe(false);
    expect(
      mockLogEntries.some(entry => entry.includes('Failed to migrate chapter')),
    ).toBe(true);
  });

  it('does not migrate chapters whose novel has no DB row', async () => {
    mockLegacyFiles.set(`${OLD_ROOT}/p1/1/5/index.html`, '<html></html>');
    mockNovels = [];
    mockDownloadedChapters = [{ id: 5, novelId: 1 }];

    await runSafMigration();

    expect(mockTree.size).toBe(0);
    expect(mockMigrationDone).toBe(false);
  });
});
