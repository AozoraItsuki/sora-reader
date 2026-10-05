import {
  clearAllReadingProgress,
  deleteReadingProgress,
  getReadingProgress,
  markReadingProgressMigrated,
  mergeReadingProgress,
  migrateReadingProgress,
  parseReadingProgressMap,
  READING_PROGRESS_KEY,
  READING_PROGRESS_MIGRATED_KEY,
  readingProgressKey,
  readReadingProgressMap,
  saveReadingProgress,
  sortReadingProgressEntries,
  toReadingProgressEntries,
  useReadingProgress,
} from '@hooks/persisted/useReadingProgress';
import { act, renderHook } from '@testing-library/react-native';
import { MMKVStorage } from '@utils/mmkv/mmkv';

jest.mock('@database/queries/ChapterQueries', () => ({
  getNovelProgressSnapshots: jest.fn(async () => []),
}));

const { getNovelProgressSnapshots } = jest.requireMock(
  '@database/queries/ChapterQueries',
) as {
  getNovelProgressSnapshots: jest.Mock;
};

const snapshotRow = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  novelId: 1,
  chapterId: 11,
  chapterName: 'Chapter 1',
  position: 40,
  charOffset: 120,
  readTime: '2026-01-02 03:04:05',
  pluginId: 'plugin-a',
  novelName: 'Novel A',
  novelPath: '/novel/a',
  novelCover: 'file:///cover-a.png',
  ...overrides,
});

beforeEach(() => {
  MMKVStorage.clearAll();
  // `clearMocks` does not reset this factory-provided mock, so call-count
  // assertions below would otherwise see a running total across tests.
  getNovelProgressSnapshots.mockClear();
  getNovelProgressSnapshots.mockResolvedValue([]);
});

describe('reading progress key + parsing', () => {
  it('keys entries by pluginId:novelId', () => {
    expect(readingProgressKey('plugin-a', 7)).toBe('plugin-a:7');
  });

  it('drops malformed entries instead of surfacing them', () => {
    const parsed = parseReadingProgressMap({
      'plugin-a:1': {
        pluginId: 'plugin-a',
        novelId: 1,
        chapterId: 2,
        novelName: 'Novel A',
        chapterName: 'Chapter 1',
        position: 150,
        charOffset: -4,
      },
      'plugin-a:2': { pluginId: 'plugin-a', novelId: 'nope' },
      'plugin-a:3': 'garbage',
    });

    expect(Object.keys(parsed)).toEqual(['plugin-a:1']);
    expect(parsed['plugin-a:1'].position).toBe(100);
    expect(parsed['plugin-a:1'].charOffset).toBe(0);
  });

  it('returns an empty map for non-object payloads', () => {
    expect(parseReadingProgressMap(undefined)).toEqual({});
    expect(parseReadingProgressMap([1, 2, 3])).toEqual({});
    expect(parseReadingProgressMap('nope')).toEqual({});
  });
});

describe('reading progress persistence', () => {
  it('saves, overwrites and reads back a single novel entry', () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      novelPath: '/novel/a',
      novelName: 'Novel A',
      cover: 'file:///cover-a.png',
      chapterId: 11,
      chapterName: 'Chapter 1',
      position: 25,
      charOffset: 300,
      updatedAt: 1_700_000_000_000,
    });

    expect(getReadingProgress('plugin-a', 1)).toEqual({
      pluginId: 'plugin-a',
      novelId: 1,
      novelPath: '/novel/a',
      novelName: 'Novel A',
      cover: 'file:///cover-a.png',
      chapterId: 11,
      chapterName: 'Chapter 1',
      position: 25,
      charOffset: 300,
      updatedAt: 1_700_000_000_000,
    });

    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      chapterId: 12,
      chapterName: 'Chapter 2',
      position: 5,
      updatedAt: 1_700_000_100_000,
    });

    const updated = getReadingProgress('plugin-a', 1);
    expect(updated?.chapterId).toBe(12);
    expect(updated?.position).toBe(5);
    expect(updated?.charOffset).toBe(0);
    expect(Object.keys(readReadingProgressMap())).toHaveLength(1);
  });

  it('sorts entries newest-first', () => {
    const map = {
      'plugin-a:1': {
        pluginId: 'plugin-a',
        novelId: 1,
        novelPath: '',
        novelName: 'Old',
        cover: null,
        chapterId: 1,
        chapterName: 'c',
        position: 10,
        charOffset: 0,
        updatedAt: 100,
      },
      'plugin-a:2': {
        pluginId: 'plugin-a',
        novelId: 2,
        novelPath: '',
        novelName: 'New',
        cover: null,
        chapterId: 2,
        chapterName: 'c',
        position: 20,
        charOffset: 0,
        updatedAt: 200,
      },
    };

    expect(
      sortReadingProgressEntries(map).map(entry => entry.novelName),
    ).toEqual(['New', 'Old']);
  });

  it('deletes a single entry and leaves the others alone', () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      chapterId: 1,
      position: 10,
    });
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 2,
      chapterId: 2,
      position: 20,
    });

    deleteReadingProgress('plugin-a', 1);

    expect(getReadingProgress('plugin-a', 1)).toBeUndefined();
    expect(getReadingProgress('plugin-a', 2)).toBeDefined();
  });

  it('deleting an unknown entry is a no-op', () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      chapterId: 1,
      position: 10,
    });

    deleteReadingProgress('plugin-a', 999);

    expect(Object.keys(readReadingProgressMap())).toEqual(['plugin-a:1']);
  });

  it('clears every entry', () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      chapterId: 1,
      position: 10,
    });
    saveReadingProgress({
      pluginId: 'plugin-b',
      novelId: 2,
      chapterId: 2,
      position: 20,
    });

    clearAllReadingProgress();

    expect(readReadingProgressMap()).toEqual({});
  });
});

describe('migration from database rows', () => {
  it('maps DB rows into store entries keyed by novel', () => {
    const entries = toReadingProgressEntries([
      snapshotRow({ novelId: 1, pluginId: 'plugin-a', chapterId: 11 }),
      snapshotRow({ novelId: 2, pluginId: 'plugin-b', chapterId: 22 }),
    ] as never);

    expect(Object.keys(entries).sort()).toEqual(['plugin-a:1', 'plugin-b:2']);
    expect(entries['plugin-a:1']).toEqual(
      expect.objectContaining({
        chapterId: 11,
        chapterName: 'Chapter 1',
        position: 40,
        charOffset: 120,
        novelName: 'Novel A',
        cover: 'file:///cover-a.png',
      }),
    );
    expect(entries['plugin-a:1'].updatedAt).toBe(
      Date.parse('2026-01-02T03:04:05'),
    );
  });

  it('falls back to updatedAt 0 when readTime is missing', () => {
    const entries = toReadingProgressEntries([
      snapshotRow({ readTime: null }),
    ] as never);

    expect(entries['plugin-a:1'].updatedAt).toBe(0);
  });

  it('never overwrites an entry the user already saved in-app', () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      novelName: 'Novel A',
      chapterId: 99,
      position: 88,
      updatedAt: 9_999,
    });

    const merged = mergeReadingProgress(
      readReadingProgressMap(),
      toReadingProgressEntries([snapshotRow()] as never),
    );

    expect(merged['plugin-a:1'].chapterId).toBe(99);
    expect(merged['plugin-a:1'].position).toBe(88);
  });

  it('adds only missing keys when merging', () => {
    const merged = mergeReadingProgress(
      {},
      toReadingProgressEntries([
        snapshotRow({ novelId: 1 }),
        snapshotRow({ novelId: 2 }),
      ] as never),
    );

    expect(Object.keys(merged).sort()).toEqual(['plugin-a:1', 'plugin-a:2']);
  });

  it('imports existing progress on first run and sets the guard flag', async () => {
    getNovelProgressSnapshots.mockResolvedValue([
      snapshotRow({ novelId: 1, chapterId: 11, position: 40 }),
    ]);

    await expect(migrateReadingProgress()).resolves.toBe(true);

    expect(getNovelProgressSnapshots).toHaveBeenCalledTimes(1);
    expect(readReadingProgressMap()['plugin-a:1']).toEqual(
      expect.objectContaining({
        novelId: 1,
        chapterId: 11,
        position: 40,
        charOffset: 120,
      }),
    );
    expect(MMKVStorage.getBoolean(READING_PROGRESS_MIGRATED_KEY)).toBe(true);
  });

  it('reports false and skips the query once the guard flag is set', async () => {
    markReadingProgressMigrated();
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      novelName: 'Kept',
      chapterId: 5,
      position: 50,
    });

    await expect(migrateReadingProgress()).resolves.toBe(false);

    expect(getNovelProgressSnapshots).not.toHaveBeenCalled();
    expect(getReadingProgress('plugin-a', 1)?.novelName).toBe('Kept');
  });

  it('is idempotent across repeated runs', async () => {
    getNovelProgressSnapshots.mockResolvedValue([
      snapshotRow({ novelId: 1, chapterId: 11, position: 40 }),
    ]);

    await expect(migrateReadingProgress()).resolves.toBe(true);
    await expect(migrateReadingProgress()).resolves.toBe(false);

    expect(getNovelProgressSnapshots).toHaveBeenCalledTimes(1);
    expect(Object.keys(readReadingProgressMap())).toEqual(['plugin-a:1']);
  });

  it('keeps the guard unset when the migration query fails', async () => {
    getNovelProgressSnapshots.mockRejectedValue(new Error('db not ready'));

    await expect(migrateReadingProgress()).resolves.toBe(false);

    expect(MMKVStorage.getBoolean(READING_PROGRESS_MIGRATED_KEY)).not.toBe(
      true,
    );
    expect(readReadingProgressMap()).toEqual({});
  });
});

describe('useReadingProgress hook', () => {
  beforeEach(() => {
    markReadingProgressMigrated();
  });

  it('renders the entries already stored in MMKV', () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      novelName: 'Novel A',
      chapterId: 1,
      position: 10,
      updatedAt: 100,
    });
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 2,
      novelName: 'Novel B',
      chapterId: 2,
      position: 20,
      updatedAt: 200,
    });

    const { result } = renderHook(() => useReadingProgress());

    expect(result.current.entries.map(entry => entry.novelName)).toEqual([
      'Novel B',
      'Novel A',
    ]);
    expect(result.current.getProgress('plugin-a', 1)?.chapterId).toBe(1);
    expect(result.current.isMigrating).toBe(false);
  });

  it('renders empty when nothing was ever stored', () => {
    const { result } = renderHook(() => useReadingProgress());

    expect(result.current.entries).toEqual([]);
    expect(result.current.getProgress('plugin-a', 1)).toBeUndefined();
  });

  it('persists saves, deletes and clears', () => {
    const { result } = renderHook(() => useReadingProgress());

    act(() => {
      result.current.saveProgress({
        pluginId: 'plugin-a',
        novelId: 1,
        novelName: 'Novel A',
        chapterId: 1,
        position: 10,
      });
      result.current.saveProgress({
        pluginId: 'plugin-a',
        novelId: 2,
        novelName: 'Novel B',
        chapterId: 2,
        position: 20,
      });
    });
    expect(Object.keys(readReadingProgressMap()).sort()).toEqual([
      'plugin-a:1',
      'plugin-a:2',
    ]);

    act(() => {
      result.current.deleteProgress('plugin-a', 1);
    });
    expect(getReadingProgress('plugin-a', 1)).toBeUndefined();
    expect(getReadingProgress('plugin-a', 2)?.novelName).toBe('Novel B');

    act(() => {
      result.current.clearAllProgress();
    });
    expect(readReadingProgressMap()).toEqual({});
    expect(
      JSON.parse(MMKVStorage.getString(READING_PROGRESS_KEY) ?? '{}'),
    ).toEqual({});
  });

  it('re-renders `entries` after an in-session write', () => {
    // Regression: `entries` was memoized on the MMKV subscription value plus an
    // internal revision counter. `MMKVStorage.set` notifies the subscription
    // synchronously, so React can render between that write and the reducer bump
    // and cache the pre-write list, stranding the Progress screen on stale rows.
    const { result } = renderHook(() => useReadingProgress());

    act(() => {
      result.current.saveProgress({
        pluginId: 'plugin-a',
        novelId: 1,
        novelName: 'Novel A',
        chapterId: 1,
        position: 10,
        updatedAt: 100,
      });
      result.current.saveProgress({
        pluginId: 'plugin-a',
        novelId: 2,
        novelName: 'Novel B',
        chapterId: 2,
        position: 20,
        updatedAt: 200,
      });
    });

    expect(result.current.entries.map(entry => entry.novelName)).toEqual([
      'Novel B',
      'Novel A',
    ]);

    act(() => {
      result.current.deleteProgress('plugin-a', 2);
    });

    expect(result.current.entries.map(entry => entry.novelName)).toEqual([
      'Novel A',
    ]);

    act(() => {
      result.current.clearAllProgress();
    });

    expect(result.current.entries).toEqual([]);
  });

  it('re-renders `entries` for a write that bypasses the hook actions', () => {
    // The reader saves through the module-level helper on every scroll tick, not
    // through `saveProgress`, so the MMKV subscription is the only signal a
    // mounted Progress screen gets. It only fires when the subscription targets
    // the same instance the helpers write to — a second `createMMKV()` instance
    // would leave `entries` frozen on [] while MMKV kept the saved rows.
    const { result } = renderHook(() => useReadingProgress());
    expect(result.current.entries).toEqual([]);

    act(() => {
      saveReadingProgress({
        pluginId: 'plugin-a',
        novelId: 1,
        novelName: 'Novel A',
        chapterId: 1,
        position: 10,
        updatedAt: 100,
      });
    });

    expect(result.current.entries.map(entry => entry.novelName)).toEqual([
      'Novel A',
    ]);

    act(() => {
      deleteReadingProgress('plugin-a', 1);
    });

    expect(result.current.entries).toEqual([]);
  });

  it('picks up a write that lands before the subscription is attached', () => {
    // `useSyncExternalStore` subscribes in a passive effect, so a write that
    // happens during the first render would be missed by the listener alone.
    // Re-reading the map on every render is what makes it visible.
    let wroteOnce = false;
    const { result } = renderHook(() => {
      const state = useReadingProgress();
      if (!wroteOnce) {
        wroteOnce = true;
        saveReadingProgress({
          pluginId: 'plugin-a',
          novelId: 7,
          novelName: 'Novel G',
          chapterId: 3,
          position: 30,
        });
      }
      return state;
    });

    expect(result.current.entries.map(entry => entry.novelName)).toEqual([
      'Novel G',
    ]);
  });
});
