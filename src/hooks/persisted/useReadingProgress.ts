import { getNovelProgressSnapshots } from '@database/queries/ChapterQueries';
import {
  getMMKVObject,
  MMKVStorage,
  setMMKVObject,
} from '@utils/mmkv/mmkv';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { useMMKVObject } from 'react-native-mmkv';

/**
 * Independent reading-progress store.
 *
 * Progress used to live only in the `Chapter.progress` / `Chapter.charOffset`
 * columns, which made it collateral damage of every cache/library cleanup: drop
 * the novel rows (or the chapter files they point at) and the reading position
 * was gone for good. Here the position is mirrored into its own MMKV map, so it
 * only disappears when the user removes it from the Progress screen.
 *
 * The DB stays the source of truth for *read state* (History, unread counts,
 * "continue reading"), so the reader keeps writing both — this store is the
 * durable copy that no cache-clearing path is allowed to remove.
 */

/** MMKV key holding the whole `${pluginId}:${novelId}` -> entry map. */
export const READING_PROGRESS_KEY = 'READING_PROGRESS_MAP';
/** Guard so the one-time import from the DB never runs twice. */
export const READING_PROGRESS_MIGRATED_KEY = 'READING_PROGRESS_MIGRATED_V1';

export const readingProgressKey = (pluginId: string, novelId: number) =>
  `${pluginId}:${novelId}`;

export interface ReadingProgressEntry {
  pluginId: string;
  novelId: number;
  novelPath: string;
  novelName: string;
  cover: string | null;
  chapterId: number;
  chapterName: string;
  /** Percentage read inside the chapter, clamped to 0-100. */
  position: number;
  /** Character offset inside the chapter, used to restore the exact scroll. */
  charOffset: number;
  /** Epoch milliseconds of the last save. */
  updatedAt: number;
}

export type ReadingProgressMap = Record<string, ReadingProgressEntry>;

export interface SaveReadingProgressInput {
  pluginId: string;
  novelId: number;
  novelPath?: string | null;
  novelName?: string | null;
  cover?: string | null;
  chapterId: number;
  chapterName?: string | null;
  position: number;
  charOffset?: number | null;
  updatedAt?: number;
}

const EMPTY_MAP: ReadingProgressMap = {};

const clampPercentage = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const normalizeCharOffset = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
};

const toTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return Date.now();
};

const asText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/**
 * Coerce a persisted row into a valid entry, or drop it.
 *
 * MMKV survives app updates, so a key written by an older shape must never be
 * able to crash the Progress screen — an entry without an identity is simply
 * discarded.
 */
const normalizeEntry = (
  key: string,
  value: unknown,
): ReadingProgressEntry | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const pluginId = asText(raw.pluginId);
  const {novelId} = raw;
  const {chapterId} = raw;
  if (
    !pluginId ||
    typeof novelId !== 'number' ||
    !Number.isFinite(novelId) ||
    typeof chapterId !== 'number' ||
    !Number.isFinite(chapterId)
  ) {
    return undefined;
  }

  return {
    pluginId,
    novelId,
    novelPath: asText(raw.novelPath),
    novelName: asText(raw.novelName),
    cover: typeof raw.cover === 'string' ? raw.cover : null,
    chapterId,
    chapterName: asText(raw.chapterName),
    position: clampPercentage(raw.position),
    charOffset: normalizeCharOffset(raw.charOffset),
    updatedAt: toTimestamp(raw.updatedAt),
  };
};

export const parseReadingProgressMap = (raw: unknown): ReadingProgressMap => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return EMPTY_MAP;
  }
  const parsed: ReadingProgressMap = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const entry = normalizeEntry(key, value);
    if (entry) {
      parsed[key] = entry;
    }
  });
  return parsed;
};

export const readReadingProgressMap = (): ReadingProgressMap =>
  parseReadingProgressMap(getMMKVObject<unknown>(READING_PROGRESS_KEY));

const writeReadingProgressMap = (map: ReadingProgressMap) => {
  setMMKVObject(READING_PROGRESS_KEY, map);
};

export const sortReadingProgressEntries = (
  map: ReadingProgressMap,
): ReadingProgressEntry[] =>
  Object.values(map).sort(
    (a, b) => b.updatedAt - a.updatedAt || b.chapterId - a.chapterId,
  );

/**
 * Write the reading position of one novel. Called on every scroll-driven save
 * from the reader, so it stays synchronous and allocation-light.
 */
export const saveReadingProgress = (
  input: SaveReadingProgressInput,
): ReadingProgressEntry => {
  // Copy first: `readReadingProgressMap` hands back a shared empty object when
  // nothing is stored yet, and mutating that would leak entries across calls.
  const map: ReadingProgressMap = { ...readReadingProgressMap() };
  const entry: ReadingProgressEntry = {
    pluginId: input.pluginId,
    novelId: input.novelId,
    novelPath: asText(input.novelPath),
    novelName: asText(input.novelName),
    cover: typeof input.cover === 'string' ? input.cover : null,
    chapterId: input.chapterId,
    chapterName: asText(input.chapterName),
    position: clampPercentage(input.position),
    charOffset: normalizeCharOffset(input.charOffset),
    updatedAt: toTimestamp(input.updatedAt),
  };
  map[readingProgressKey(entry.pluginId, entry.novelId)] = entry;
  writeReadingProgressMap(map);
  return entry;
};

export const deleteReadingProgress = (
  pluginId: string,
  novelId: number,
): void => {
  const map: ReadingProgressMap = { ...readReadingProgressMap() };
  if (!(readingProgressKey(pluginId, novelId) in map)) {
    return;
  }
  delete map[readingProgressKey(pluginId, novelId)];
  writeReadingProgressMap(map);
};

export const clearAllReadingProgress = (): void => {
  writeReadingProgressMap({});
};

export const getReadingProgress = (
  pluginId: string,
  novelId: number,
): ReadingProgressEntry | undefined =>
  readReadingProgressMap()[readingProgressKey(pluginId, novelId)];

const hasMigrated = (): boolean =>
  MMKVStorage.getBoolean(READING_PROGRESS_MIGRATED_KEY) === true;

export const markReadingProgressMigrated = (): void => {
  MMKVStorage.set(READING_PROGRESS_MIGRATED_KEY, true);
};

/**
 * Turn DB rows into store entries.
 *
 * `readTime` is written by SQLite as a *local* datetime string, and the
 * date-time form without a zone offset is parsed as local time — so the
 * resulting epoch is what the user would see on their own clock.
 */
export const toReadingProgressEntries = (
  rows: Awaited<ReturnType<typeof getNovelProgressSnapshots>>,
): ReadingProgressMap => {
  const migrated: ReadingProgressMap = {};
  rows.forEach(row => {
    const parsedReadTime = row.readTime
      ? Date.parse(row.readTime.replace(' ', 'T'))
      : NaN;
    const entry: ReadingProgressEntry = {
      pluginId: row.pluginId,
      novelId: row.novelId,
      novelPath: asText(row.novelPath),
      novelName: asText(row.novelName),
      cover: typeof row.novelCover === 'string' ? row.novelCover : null,
      chapterId: row.chapterId,
      chapterName: asText(row.chapterName),
      position: clampPercentage(row.position),
      charOffset: normalizeCharOffset(row.charOffset),
      updatedAt: Number.isFinite(parsedReadTime) ? parsedReadTime : 0,
    };
    migrated[readingProgressKey(entry.pluginId, entry.novelId)] = entry;
  });
  return migrated;
};

/**
 * Fold migrated rows into the store.
 *
 * Only keys that are *absent* are added: a novel the user already read in this
 * session must keep its newer in-app position instead of being rolled back to
 * whatever the DB happened to hold.
 */
export const mergeReadingProgress = (
  existing: ReadingProgressMap,
  migrated: ReadingProgressMap,
): ReadingProgressMap => {
  let changed = false;
  const merged: ReadingProgressMap = { ...existing };
  Object.entries(migrated).forEach(([key, entry]) => {
    if (!(key in merged)) {
      merged[key] = entry;
      changed = true;
    }
  });
  return changed ? merged : existing;
};

/**
 * One-time import of progress already stored in the DB.
 *
 * Exported so it can be exercised without mounting the hook: the read/merge/flag
 * behaviour is the part worth pinning down, and driving it through a React
 * effect makes the test depend on render timing rather than on the logic.
 *
 * Returns `true` when the DB was actually queried, so a caller can tell a
 * skipped migration from an empty one.
 */
export const migrateReadingProgress = async (): Promise<boolean> => {
  if (hasMigrated()) {
    return false;
  }
  try {
    const rows = await getNovelProgressSnapshots();
    writeReadingProgressMap(
      mergeReadingProgress(
        readReadingProgressMap(),
        toReadingProgressEntries(rows),
      ),
    );
    markReadingProgressMigrated();
    return true;
  } catch {
    // Leave the flag unset so a broken/empty DB retries on the next launch
    // instead of silently dropping the user's progress forever.
    return false;
  }
};

export const useReadingProgress = () => {
  // Subscribed purely for its change signal: this re-renders the component
  // whenever the MMKV key is written (including by the reader, which writes
  // through the module-level helper to avoid re-rendering the WebView on every
  // scroll tick). The parsed value is deliberately unused — `entries` re-reads
  // the map every render, see below. `MMKVStorage` is passed explicitly so the
  // subscription always targets the exact instance the helpers write to.
  useMMKVObject<ReadingProgressMap>(READING_PROGRESS_KEY, MMKVStorage);
  // `bumpRevision` is the second half of the same safety net: a write notifies
  // the subscription synchronously and the reducer runs right after it, so both
  // are kept in case either signal is ever missed.
  const [, bumpRevision] = useReducer((value: number) => value + 1, 0);
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    if (hasMigrated()) {
      return;
    }
    let cancelled = false;
    setIsMigrating(true);
    migrateReadingProgress()
      .then(didMigrate => {
        if (cancelled) {
          return;
        }
        if (didMigrate) {
          // The MMKV write above fires the `useMMKVObject` subscription, but bump
          // anyway so a missed listener can never strand the screen on [].
          bumpRevision();
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsMigrating(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deliberately NOT memoized on `[storedMap, revision]`: the two write paths
  // (`MMKVStorage.set`, which notifies the `useMMKVObject` subscriber
  // synchronously, and the reducer bump right after it) can leave a render
  // between them, so a memo keyed on those deps is free to hand back the list
  // from before the write. Re-reading on every render is what actually keeps the
  // promise made above it — a missed or out-of-order listener can never show
  // stale rows. The map holds one small entry per started novel, so the parse is
  // cheap next to a list render.
  const entries = sortReadingProgressEntries(readReadingProgressMap());

  // Reads straight from MMKV on every call, so it needs no deps and always
  // reflects the newest write — same reason `entries` above is not memoized.
  const getProgress = useCallback(
    (pluginId: string, novelId: number) =>
      readReadingProgressMap()[readingProgressKey(pluginId, novelId)],
    [],
  );

  const saveProgress = useCallback((input: SaveReadingProgressInput) => {
    const entry = saveReadingProgress(input);
    bumpRevision();
    return entry;
  }, []);

  const deleteProgress = useCallback((pluginId: string, novelId: number) => {
    deleteReadingProgress(pluginId, novelId);
    bumpRevision();
  }, []);

  const clearAllProgress = useCallback(() => {
    clearAllReadingProgress();
    bumpRevision();
  }, []);

  return {
    entries,
    getProgress,
    isMigrating,
    saveProgress,
    deleteProgress,
    clearAllProgress,
  };
};

export default useReadingProgress;