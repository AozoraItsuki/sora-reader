/**
 * Tests for HistoryQueries
 *
 * These tests use a real in-memory database to verify actual data returned by queries.
 */

import './mockDb';

import {
  deleteAllHistory,
  deleteChapterHistory,
  getHistoryFromDb,
  insertHistory,
} from '../HistoryQueries';
import { getTestDb, setupTestDatabase, teardownTestDatabase } from './setup';
import { clearAllTables, insertTestChapter, insertTestNovel } from './testData';

describe('HistoryQueries', () => {
  beforeEach(() => {
    const testDb = setupTestDatabase();
    clearAllTables(testDb);
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  describe('getHistoryFromDb', () => {
    it('should return reading history grouped by novel', async () => {
      const testDb = getTestDb();

      const novelId1 = await insertTestNovel(testDb, { inLibrary: true });
      const novelId2 = await insertTestNovel(testDb, { inLibrary: true });

      const chapterId1 = await insertTestChapter(testDb, novelId1);
      const chapterId2 = await insertTestChapter(testDb, novelId2);

      await insertHistory(chapterId1);
      await insertHistory(chapterId2);

      const result = await getHistoryFromDb();

      expect(result.length).toBeGreaterThanOrEqual(2);
      const novelIds = result.map(h => h.novelId);
      expect(novelIds).toContain(novelId1);
      expect(novelIds).toContain(novelId2);
    });

    it('should return empty array when no history exists', async () => {
      const result = await getHistoryFromDb();

      expect(result).toEqual([]);
    });

    it('should only return chapters with readTime', async () => {
      const testDb = getTestDb();

      const novelId = await insertTestNovel(testDb, { inLibrary: true });
      const chapterId1 = await insertTestChapter(testDb, novelId);
      await insertTestChapter(testDb, novelId); // No readTime

      await insertHistory(chapterId1);

      const result = await getHistoryFromDb();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(chapterId1);
    });

    it('should return one latest chapter per novel with a deterministic tie-breaker', async () => {
      const testDb = getTestDb();
      const firstNovelId = await insertTestNovel(testDb, { inLibrary: true });
      const secondNovelId = await insertTestNovel(testDb, { inLibrary: true });
      const tiedReadTime = '2026-09-25 12:00:00';
      const firstChapterId = await insertTestChapter(testDb, firstNovelId, {
        readTime: tiedReadTime,
      });
      const targetChapterId = await insertTestChapter(testDb, firstNovelId, {
        readTime: tiedReadTime,
      });
      const secondNovelChapterId = await insertTestChapter(
        testDb,
        secondNovelId,
        {
          readTime: '2026-09-25 11:00:00',
        },
      );

      const result = await getHistoryFromDb();

      expect(result).toHaveLength(2);
      expect(result.find(item => item.novelId === firstNovelId)?.id).toBe(
        targetChapterId,
      );
      expect(result.find(item => item.novelId === secondNovelId)?.id).toBe(
        secondNovelChapterId,
      );
      expect(result.map(item => item.id)).not.toContain(firstChapterId);
    });
  });

  describe('insertHistory', () => {
    it('should set readTime to current time', async () => {
      const testDb = getTestDb();

      const novelId = await insertTestNovel(testDb, { inLibrary: true });
      const chapterId = await insertTestChapter(testDb, novelId, {
        readTime: null,
      });

      await insertHistory(chapterId);

      const history = await getHistoryFromDb();
      const chapter = history.find(h => h.id === chapterId);
      expect(chapter?.readTime).toBeDefined();
      expect(chapter?.readTime).not.toBeNull();
    });
  });

  describe('deleteChapterHistory', () => {
    it('should remove chapter from history', async () => {
      const testDb = getTestDb();

      const novelId = await insertTestNovel(testDb, { inLibrary: true });
      const chapterId = await insertTestChapter(testDb, novelId);

      await insertHistory(chapterId);
      await deleteChapterHistory(chapterId);

      const history = await getHistoryFromDb();
      expect(history.find(h => h.id === chapterId)).toBeUndefined();
    });
  });

  describe('deleteAllHistory', () => {
    it('should clear all reading history', async () => {
      const testDb = getTestDb();

      const novelId1 = await insertTestNovel(testDb, { inLibrary: true });
      const novelId2 = await insertTestNovel(testDb, { inLibrary: true });

      const chapterId1 = await insertTestChapter(testDb, novelId1);
      const chapterId2 = await insertTestChapter(testDb, novelId2);

      await insertHistory(chapterId1);
      await insertHistory(chapterId2);
      await deleteAllHistory();

      const history = await getHistoryFromDb();
      expect(history).toEqual([]);
    });
  });
});
