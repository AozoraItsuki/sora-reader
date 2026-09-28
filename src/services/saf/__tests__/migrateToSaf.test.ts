import {
  _legacyAbsPath,
  collectLegacyCoverRefs,
  hasLegacyDownloads,
  reconcileDownloadFlags,
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
let mockFsReads: string[];
let mockAllChapters: Map<number, Array<{ id: number; isDownloaded: boolean }>>;
let mockFlagUpdates: Array<{ id: number; downloaded: boolean }>;

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
  mockFsReads = [];
  mockAllChapters = new Map();
  mockFlagUpdates = [];
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
  safGetFileSize: async (rel: string) => mockTree.get(rel)?.data.length ?? 0,
}));

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: async (path: string) => {
    mockFsReads.push(path);
    return `base64(${path})`;
  },
}));

jest.mock('@database/queries/ChapterQueries', () => ({
  getNovelChapters: async (novelId: number) =>
    (mockAllChapters.get(novelId) ?? []).map(chapter => ({ ...chapter })),
  setChapterDownloaded: async (id: number, downloaded: boolean) => {
    mockFlagUpdates.push({ id, downloaded });
  },
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
    // The image payload is copied verbatim as base64, read via a file:// URI
    // (expo-file-system rejects bare absolute paths).
    expect(mockTree.get('Novels/p1/1/5/3.b64.png')).toEqual({
      data: `base64(file://${OLD_ROOT}/p1/1/5/3.b64.png)`,
      encoding: 'base64',
    });
    expect(mockTree.get('Novels/p1/1/cover.png')).toEqual({
      data: `base64(file://${OLD_ROOT}/p1/1/cover.png)`,
      encoding: 'base64',
    });
    expect(mockFsReads).toContain(`file://${OLD_ROOT}/p1/1/5/3.b64.png`);

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

    // The failed index.html keeps the chapter folder alive, but its sibling
    // image is still migrated (per-file verification): progress is preserved
    // and the retry only re-copies what is missing.
    expect(mockLegacyFiles.has(`${OLD_ROOT}/p1/1/5/index.html`)).toBe(true);
    expect(mockTree.has('Novels/p1/1/5/3.b64.png')).toBe(true);
    expect(mockLegacyFiles.has(`${OLD_ROOT}/p1/1/5/3.b64.png`)).toBe(false);
    expect(mockLegacyUnlinked).not.toContain(`${OLD_ROOT}/p1/1/5`);
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

  it('migrates a chapter whose novel row is gone, inferring the tree path from disk', async () => {
    // A deleted novel leaves its chapters behind: the DB-driven pass cannot map
    // them, so only a walk of the legacy tree can rescue them.
    const dir = `${OLD_ROOT}/p1/1/5`;
    mockLegacyFiles.set(
      `${dir}/index.html`,
      `<html><body><img src="file://${dir}/3.b64.png"></body></html>`,
    );
    mockLegacyFiles.set(`${dir}/3.b64.png`, 'PNGDATA');
    mockNovels = [];
    mockDownloadedChapters = [{ id: 5, novelId: 1 }];

    await runSafMigration();

    expect(mockTree.get('Novels/p1/1/5/index.html')).toEqual({
      data: '<html><body><img src="3.b64.png"></body></html>',
      encoding: 'utf8',
    });
    expect(mockTree.get('Novels/p1/1/5/3.b64.png')).toEqual({
      data: `base64(file://${dir}/3.b64.png)`,
      encoding: 'base64',
    });
    expect(mockLegacyFiles.size).toBe(0);
    expect(mockMigrationDone).toBe(true);
  });

  it('migrates a chapter into the current pluginId when the folder on disk is stale', async () => {
    // The plugin was renamed: the chapter sits under the old folder, but the DB
    // row knows the pluginId the reader will look under.
    const dir = `${OLD_ROOT}/oldPlugin/1/5`;
    mockLegacyFiles.set(`${dir}/index.html`, '<html><body></body></html>');
    mockLegacyFiles.set(`${dir}/3.b64.png`, 'PNGDATA');
    mockNovels = [{ id: 1, pluginId: 'newPlugin', cover: null }];
    mockDownloadedChapters = [{ id: 5, novelId: 1 }];

    await runSafMigration();

    expect(mockTree.has('Novels/newPlugin/1/5/index.html')).toBe(true);
    expect(mockTree.has('Novels/newPlugin/1/5/3.b64.png')).toBe(true);
    expect(mockTree.has('Novels/oldPlugin/1/5/index.html')).toBe(false);
    expect(mockLegacyFiles.size).toBe(0);
  });

  it('leaves a chapter directory that has no index.html for the next attempt', async () => {
    // No index.html means the folder is not a chapter this app wrote, so the walk
    // must not claim it — and the legacy root must survive so nothing is lost.
    mockLegacyFiles.set(`${OLD_ROOT}/p1/1/5/3.b64.png`, 'PNGDATA');
    mockNovels = [];
    mockDownloadedChapters = [];

    await runSafMigration();

    expect(mockTree.size).toBe(0);
    expect(mockLegacyFiles.has(`${OLD_ROOT}/p1/1/5/3.b64.png`)).toBe(true);
    expect(mockMigrationDone).toBe(false);
  });

  it('leaves a chapter folder whose names are not row ids untouched', async () => {
    mockLegacyFiles.set(`${OLD_ROOT}/p1/scratch/index.html`, '<html></html>');
    mockNovels = [];
    mockDownloadedChapters = [];

    await runSafMigration();

    expect(mockTree.size).toBe(0);
    expect(mockLegacyFiles.has(`${OLD_ROOT}/p1/scratch/index.html`)).toBe(true);
    expect(mockMigrationDone).toBe(false);
  });
});

describe('runSafMigration force flag', () => {
  it('runs a marked-done migration again when forced', async () => {
    mockMigrationDone = true;
    seedLegacyNovel(
      { id: 1, pluginId: 'p1', cover: `file://${OLD_ROOT}/p1/1/cover.png` },
      [{ id: 5, novelId: 1 }],
    );

    await runSafMigration(undefined, true);

    expect(mockTree.has('Novels/p1/1/5/index.html')).toBe(true);
    expect(mockLegacyFiles.size).toBe(0);
  });

  it('stays closed to a marked-done migration without the force flag', async () => {
    mockMigrationDone = true;
    seedLegacyNovel(
      { id: 1, pluginId: 'p1', cover: `file://${OLD_ROOT}/p1/1/cover.png` },
      [{ id: 5, novelId: 1 }],
    );

    await runSafMigration();

    expect(mockTree.size).toBe(0);
    expect(mockLegacyFiles.size).toBeGreaterThan(0);
  });
});

describe('runSafMigration progress', () => {
  const collectProgress = () => {
    const calls: Array<{ done: number; total: number; label: string }> = [];
    const onProgress = (done: number, total: number, label: string) => {
      calls.push({ done, total, label });
    };
    return { calls, onProgress };
  };

  it('reports one step per discovered chapter and cover', async () => {
    seedLegacyNovel(
      { id: 1, pluginId: 'p1', cover: `file://${OLD_ROOT}/p1/1/cover.png` },
      [
        { id: 5, novelId: 1 },
        { id: 6, novelId: 1 },
      ],
    );
    const { calls, onProgress } = collectProgress();

    await runSafMigration(onProgress);

    expect(calls).toEqual([
      { done: 1, total: 3, label: 'Novels/p1/1/5' },
      { done: 2, total: 3, label: 'Novels/p1/1/6' },
      { done: 3, total: 3, label: 'Novels/p1/1/cover.png' },
    ]);
  });

  it('counts a disk-orphaned chapter towards the total', async () => {
    // One chapter from the DB, one only reachable through the legacy tree.
    const orphan = `${OLD_ROOT}/p1/1/9`;
    mockLegacyFiles.set(`${orphan}/index.html`, '<html></html>');
    seedLegacyNovel({ id: 1, pluginId: 'p1', cover: null }, [
      { id: 5, novelId: 1 },
    ]);
    const { calls, onProgress } = collectProgress();

    await runSafMigration(onProgress);

    expect(calls.map(call => call.label)).toEqual([
      'Novels/p1/1/5',
      'Novels/p1/1/9',
    ]);
    expect(calls[calls.length - 1]).toEqual({
      done: 2,
      total: 2,
      label: 'Novels/p1/1/9',
    });
  });

  it('keeps counting a unit whose copy failed', async () => {
    seedLegacyNovel({ id: 1, pluginId: 'p1', cover: null }, [
      { id: 5, novelId: 1 },
    ]);
    mockFailWriteFor = rel => rel === 'Novels/p1/1/5/index.html';
    const { calls, onProgress } = collectProgress();

    await runSafMigration(onProgress);

    expect(calls).toEqual([{ done: 1, total: 1, label: 'Novels/p1/1/5' }]);
  });

  it('reports no steps when the permission is missing', async () => {
    mockPermissionGranted = false;
    seedLegacyNovel({ id: 1, pluginId: 'p1', cover: null }, [
      { id: 5, novelId: 1 },
    ]);
    const { calls, onProgress } = collectProgress();

    await runSafMigration(onProgress);

    expect(calls).toEqual([]);
  });
});

describe('collectLegacyCoverRefs', () => {
  it('finds covers under any plugin folder', () => {
    mockLegacyFiles.set(`${OLD_ROOT}/stale/1/cover.png`, 'JPEG');
    mockLegacyFiles.set(`${OLD_ROOT}/p1/2/cover.png`, 'JPEG');

    expect(collectLegacyCoverRefs(OLD_ROOT)).toEqual([
      {
        source: `${OLD_ROOT}/stale/1/cover.png`,
        novelId: 1,
        fromPluginId: 'stale',
      },
      { source: `${OLD_ROOT}/p1/2/cover.png`, novelId: 2, fromPluginId: 'p1' },
    ]);
  });

  it('ignores non-numeric folders and returns empty for a missing root', () => {
    mockLegacyFiles.set(`${OLD_ROOT}/p1/scratch/cover.png`, 'JPEG');

    expect(collectLegacyCoverRefs(OLD_ROOT)).toEqual([]);
    expect(collectLegacyCoverRefs('/root/Nowhere')).toEqual([]);
  });
});

describe('migration verify-before-delete', () => {
  it('keeps the source when the read is empty and writes nothing', async () => {
    const dir = `${OLD_ROOT}/p1/1/5`;
    mockLegacyFiles.set(`${dir}/index.html`, '');
    mockNovels = [{ id: 1, pluginId: 'p1', cover: null }];
    mockDownloadedChapters = [{ id: 5, novelId: 1 }];

    await runSafMigration();

    expect(mockTree.has('Novels/p1/1/5/index.html')).toBe(false);
    expect(mockLegacyFiles.has(`${dir}/index.html`)).toBe(true);
    expect(mockMigrationDone).toBe(false);
  });

  it('copies a cover from a stale plugin folder into the current one', async () => {
    mockLegacyFiles.set(`${OLD_ROOT}/oldPlugin/1/cover.png`, 'JPEG');
    mockNovels = [
      {
        id: 1,
        pluginId: 'newPlugin',
        cover: `file://${OLD_ROOT}/newPlugin/1/cover.png`,
      },
    ];
    mockDownloadedChapters = [];

    await runSafMigration();

    expect(mockTree.get('Novels/newPlugin/1/cover.png')).toEqual({
      data: `base64(file://${OLD_ROOT}/oldPlugin/1/cover.png)`,
      encoding: 'base64',
    });
    expect(mockCoverUpdates).toEqual([
      { id: 1, cover: 'Novels/newPlugin/1/cover.png' },
    ]);
  });

  it('leaves the DB cover alone when no cover file exists on disk', async () => {
    mockLegacyFiles.set(`${OLD_ROOT}/p1/1/5/index.html`, '<html></html>');
    mockNovels = [
      { id: 1, pluginId: 'p1', cover: `file://${OLD_ROOT}/p1/1/cover.png` },
    ];
    mockDownloadedChapters = [];

    await runSafMigration();

    // The old code rewrote the DB to a path with no file behind it (blank
    // covers). Now the DB is untouched. The chapter itself migrates cleanly
    // and nothing remains, so the run still closes out.
    expect(mockCoverUpdates).toEqual([]);
    expect(mockMigrationDone).toBe(true);
  });

  it('remaps an orphan chapter via the novel when it has no DB row', async () => {
    // Novel row exists under the current pluginId, but this chapter was never
    // inserted — the chapter-level map misses it, the novel-level map must not.
    const dir = `${OLD_ROOT}/oldPlugin/1/7`;
    mockLegacyFiles.set(`${dir}/index.html`, '<html></html>');
    mockNovels = [{ id: 1, pluginId: 'newPlugin', cover: null }];
    mockDownloadedChapters = [];

    await runSafMigration();

    expect(mockTree.has('Novels/newPlugin/1/7/index.html')).toBe(true);
    expect(mockTree.has('Novels/oldPlugin/1/7/index.html')).toBe(false);
  });
});

describe('reconcileDownloadFlags', () => {
  it('heals a flag when the file sits in the tree', async () => {
    mockNovels = [{ id: 1, pluginId: 'p1', cover: null }];
    mockAllChapters.set(1, [{ id: 9, isDownloaded: false }]);
    mockTree.set('Novels/p1/1/9/index.html', {
      data: '<html></html>',
      encoding: 'utf8',
    });

    await expect(reconcileDownloadFlags()).resolves.toEqual({
      healed: 1,
      cleared: 0,
    });
    expect(mockFlagUpdates).toEqual([{ id: 9, downloaded: true }]);
  });

  it('clears a flag whose file is gone from both tree and legacy root', async () => {
    mockNovels = [{ id: 1, pluginId: 'p1', cover: null }];
    mockAllChapters.set(1, [{ id: 10, isDownloaded: true }]);

    await expect(reconcileDownloadFlags()).resolves.toEqual({
      healed: 0,
      cleared: 1,
    });
    expect(mockFlagUpdates).toEqual([{ id: 10, downloaded: false }]);
  });

  it('leaves agreeing rows untouched', async () => {
    mockNovels = [{ id: 1, pluginId: 'p1', cover: null }];
    mockAllChapters.set(1, [
      { id: 11, isDownloaded: true },
      { id: 12, isDownloaded: false },
    ]);
    mockTree.set('Novels/p1/1/11/index.html', {
      data: '<html></html>',
      encoding: 'utf8',
    });

    await expect(reconcileDownloadFlags()).resolves.toEqual({
      healed: 0,
      cleared: 0,
    });
    expect(mockFlagUpdates).toEqual([]);
  });
});
