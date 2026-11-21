package app.sorareader.data.repository

import app.sorareader.data.local.db.SoraDatabase
import app.sorareader.data.local.entity.CategoryEntity
import app.sorareader.data.local.entity.NovelCategoryEntity
import app.sorareader.data.local.entity.ReadingHistoryEntity
import app.sorareader.data.local.entity.toDomain
import app.sorareader.data.local.entity.toEntity
import app.sorareader.domain.model.Category
import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.HistoryEntry
import app.sorareader.domain.model.Novel
import app.sorareader.domain.repository.NovelRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class RoomNovelRepository(db: SoraDatabase) : NovelRepository {
    private val novels = db.novelDao()
    private val chapters = db.chapterDao()
    private val categories = db.categoryDao()
    private val history = db.historyDao()

    override fun observeLibrary(query: String): Flow<List<Novel>> =
        (if (query.isBlank()) novels.observeLibrary() else novels.searchLibrary(query)).map { it.map { e -> e.toDomain() } }

    override fun observeNovel(novelId: Long): Flow<Novel?> = novels.observeById(novelId).map { it?.toDomain() }
    override fun observeChapters(novelId: Long): Flow<List<Chapter>> = chapters.observeByNovel(novelId).map { it.map { e -> e.toDomain() } }
    override fun observeCategories(): Flow<List<Category>> = categories.observeAll().map { it.map { e -> e.toDomain() } }
    override fun observeDownloaded(): Flow<List<Chapter>> = chapters.observeAllDownloaded().map { it.map { e -> e.toDomain() } }
    override fun observeHistory(): Flow<List<HistoryEntry>> = history.observeHistory().map { rows ->
        rows.map { HistoryEntry(it.chapterId, it.novelId, it.novelTitle, it.novelCover, it.chapterTitle, it.chapterNumber, it.readAt, it.readProgress, it.sourceId, it.novelUrl) }
    }

    override suspend fun getNovelById(id: Long): Novel? = novels.getById(id)?.toDomain()
    override suspend fun getChapterById(id: Long): Chapter? = chapters.getById(id)?.toDomain()
    override suspend fun getChapters(novelId: Long): List<Chapter> = chapters.getByNovel(novelId).map { it.toDomain() }
    override suspend fun getFirstUnread(novelId: Long): Chapter? = chapters.getFirstUnread(novelId)?.toDomain()

    override suspend fun upsertNovel(novel: Novel): Long {
        val existing = if (novel.id == 0L) novels.getBySourceUrl(novel.sourceId, novel.url) else null
        val entity = novel.copy(id = existing?.id ?: novel.id).toEntity()
        val id = novels.upsert(entity)
        val resolvedId = if (novel.id != 0L) novel.id else id
        refreshNovelStats(resolvedId)
        return resolvedId
    }

    override suspend fun upsertChapters(chapters: List<Chapter>) {
        if (chapters.isEmpty()) return
        this.chapters.upsertAll(chapters.map { it.toEntity() })
        refreshNovelStats(chapters.first().novelId)
    }

    override suspend fun setInLibrary(novelId: Long, inLibrary: Boolean) {
        novels.setInLibrary(novelId, inLibrary)
        if (inLibrary) categories.insertNovelCategory(NovelCategoryEntity(novelId, 1L))
    }

    override suspend fun updateChapterProgress(chapterId: Long, progress: Float, isRead: Boolean) {
        chapters.updateProgress(chapterId, progress.coerceIn(0f, 1f), isRead)
        val chapter = chapters.getById(chapterId) ?: return
        novels.updateLastRead(chapter.novelId, System.currentTimeMillis())
        if (isRead || progress > 0f) history.upsert(ReadingHistoryEntity(chapterId, System.currentTimeMillis()))
        refreshNovelStats(chapter.novelId)
    }

    override suspend fun markChapterDownloaded(chapterId: Long, downloaded: Boolean, contentPath: String?) {
        chapters.updateDownload(chapterId, downloaded, contentPath)
        chapters.getById(chapterId)?.let { refreshNovelStats(it.novelId) }
    }

    override suspend fun toggleBookmark(chapterId: Long, bookmarked: Boolean) { chapters.updateBookmark(chapterId, bookmarked) }
    override suspend fun markNovelRead(novelId: Long, read: Boolean) { chapters.markNovelRead(novelId, read); refreshNovelStats(novelId) }

    override suspend fun deleteNovel(novelId: Long) {
        chapters.deleteByNovel(novelId)
        categories.clearNovelCategories(novelId)
        novels.deleteById(novelId)
    }

    override suspend fun addCategory(name: String) { categories.insert(CategoryEntity(name = name.trim())) }
    override suspend fun deleteCategory(categoryId: Long) { if (categoryId !in setOf(1L, 2L)) categories.delete(categoryId) }

    override suspend fun getNovelCategoryIds(novelId: Long): List<Long> = categories.getNovelCategoryIds(novelId)
    override suspend fun setNovelCategories(novelId: Long, categoryIds: Set<Long>) {
        categories.clearNovelCategories(novelId)
        categoryIds.forEach { categories.insertNovelCategory(NovelCategoryEntity(novelId, it)) }
    }

    override suspend fun recordHistory(chapterId: Long) { history.upsert(ReadingHistoryEntity(chapterId, System.currentTimeMillis())) }
    override suspend fun deleteHistory(chapterId: Long) { history.delete(chapterId) }
    override suspend fun clearHistory() { history.clearAll() }

    override suspend fun refreshNovelStats(novelId: Long) {
        val novel = novels.getById(novelId) ?: return
        val total = chapters.countByNovel(novelId)
        val unread = chapters.countUnreadByNovel(novelId)
        val downloaded = chapters.countDownloadedByNovel(novelId)
        novels.update(novel.copy(totalChapters = total, chaptersUnread = unread, chaptersDownloaded = downloaded))
    }
}
