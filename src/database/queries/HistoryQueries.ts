import { dbManager } from '@database/db';
import {
  chapterSchema,
  extendedChapterHistorySchema,
  novelSchema,
} from '@database/schema';
import { getString } from '@strings/translations';
import { showToast } from '@utils/showToast';
import { desc, eq, isNotNull, sql } from 'drizzle-orm';

/**
 * Get reading history from the database using Drizzle ORM.
 * Returns one latest read chapter for each novel.
 */
export const getHistoryFromDb = async () => {
  const rankedChapters = dbManager
    .select({
      chapterId: chapterSchema.id,
      novelId: chapterSchema.novelId,
      path: chapterSchema.path,
      name: chapterSchema.name,
      releaseTime: chapterSchema.releaseTime,
      bookmark: chapterSchema.bookmark,
      unread: chapterSchema.unread,
      readTime: chapterSchema.readTime,
      isDownloaded: chapterSchema.isDownloaded,
      updatedTime: chapterSchema.updatedTime,
      chapterNumber: chapterSchema.chapterNumber,
      page: chapterSchema.page,
      position: chapterSchema.position,
      progress: chapterSchema.progress,
      charOffset: chapterSchema.charOffset,
      pluginId: novelSchema.pluginId,
      novelName: novelSchema.name,
      novelPath: novelSchema.path,
      novelCover: novelSchema.cover,
      historyRank: sql<number>`row_number() over (
        partition by ${chapterSchema.novelId}
        order by ${chapterSchema.readTime} desc, ${chapterSchema.id} desc
      )`.as('historyRank'),
    })
    .from(chapterSchema)
    .innerJoin(novelSchema, eq(chapterSchema.novelId, novelSchema.id))
    .where(isNotNull(chapterSchema.readTime))
    .as('rankedChapters');

  return dbManager
    .select({
      id: rankedChapters.chapterId,
      novelId: rankedChapters.novelId,
      path: rankedChapters.path,
      name: rankedChapters.name,
      releaseTime: rankedChapters.releaseTime,
      bookmark: rankedChapters.bookmark,
      unread: rankedChapters.unread,
      readTime: rankedChapters.readTime,
      isDownloaded: rankedChapters.isDownloaded,
      updatedTime: rankedChapters.updatedTime,
      chapterNumber: rankedChapters.chapterNumber,
      page: rankedChapters.page,
      position: rankedChapters.position,
      progress: rankedChapters.progress,
      charOffset: rankedChapters.charOffset,
      pluginId: rankedChapters.pluginId,
      novelName: rankedChapters.novelName,
      novelPath: rankedChapters.novelPath,
      novelCover: rankedChapters.novelCover,
    })
    .from(rankedChapters)
    .where(eq(rankedChapters.historyRank, 1))
    .orderBy(desc(rankedChapters.readTime), desc(rankedChapters.chapterId))
    .all();
};

/**
 * Update the readTime of a chapter to the current time.
 */
export const insertHistory = async (chapterId: number): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .update(chapterSchema)
      .set({
        readTime: sql`datetime('now','localtime')`,
      })
      .where(eq(chapterSchema.id, chapterId))
      .run();
  });
};

/**
 * Remove a chapter from history by setting its readTime to NULL.
 */
export const deleteChapterHistory = async (
  chapterId: number,
): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .update(chapterSchema)
      .set({ readTime: null })
      .where(eq(chapterSchema.id, chapterId))
      .run();
  });
};

/**
 * Clear all reading history by setting readTime to NULL for all chapters.
 */
export const deleteAllHistory = async (): Promise<void> => {
  await dbManager.write(async tx => {
    await tx.update(chapterSchema).set({ readTime: null }).run();
  });
  showToast(getString('historyScreen.deleted'));
};

export const getAllHistoryRaw = (): Promise<
  {
    chapterId: number;
    readDuration: number;
  }[]
> => {
  return dbManager.select().from(extendedChapterHistorySchema).all();
};
