package app.sorareader.domain.repository

import app.sorareader.domain.model.Category
import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.ChapterContent
import app.sorareader.domain.model.DownloadTask
import app.sorareader.domain.model.HistoryEntry
import app.sorareader.domain.model.Novel
import app.sorareader.domain.model.Repository
import app.sorareader.domain.model.SourceDescriptor
import app.sorareader.domain.model.SourceNovel
import kotlinx.coroutines.flow.Flow

interface NovelRepository {
    fun observeLibrary(query: String = ""): Flow<List<Novel>>
    fun observeNovel(novelId: Long): Flow<Novel?>
    fun observeChapters(novelId: Long): Flow<List<Chapter>>
    fun observeCategories(): Flow<List<Category>>
    fun observeHistory(): Flow<List<HistoryEntry>>
    fun observeDownloaded(): Flow<List<Chapter>>
    suspend fun getNovelById(id: Long): Novel?
    suspend fun getChapterById(id: Long): Chapter?
    suspend fun getChapters(novelId: Long): List<Chapter>
    suspend fun getFirstUnread(novelId: Long): Chapter?
    suspend fun upsertNovel(novel: Novel): Long
    suspend fun upsertChapters(chapters: List<Chapter>)
    suspend fun setInLibrary(novelId: Long, inLibrary: Boolean)
    suspend fun updateChapterProgress(chapterId: Long, progress: Float, isRead: Boolean)
    suspend fun markChapterDownloaded(chapterId: Long, downloaded: Boolean, contentPath: String?)
    suspend fun toggleBookmark(chapterId: Long, bookmarked: Boolean)
    suspend fun markNovelRead(novelId: Long, read: Boolean)
    suspend fun deleteNovel(novelId: Long)
    suspend fun addCategory(name: String)
    suspend fun deleteCategory(categoryId: Long)
    suspend fun getNovelCategoryIds(novelId: Long): List<Long>
    suspend fun setNovelCategories(novelId: Long, categoryIds: Set<Long>)
    suspend fun recordHistory(chapterId: Long)
    suspend fun deleteHistory(chapterId: Long)
    suspend fun clearHistory()
    suspend fun refreshNovelStats(novelId: Long)
}

interface SourceCatalog {
    fun availableSources(): List<SourceDescriptor>
    suspend fun browse(sourceId: String, query: String = "", page: Int = 1): List<Novel>
    suspend fun fetchNovelDetails(sourceId: String, novelUrl: String): SourceNovel
    suspend fun fetchChapters(sourceId: String, novelUrl: String): List<Chapter>
    suspend fun fetchChapterContent(sourceId: String, chapterUrl: String): ChapterContent
}

interface RepositoryStore {
    fun observeRepositories(): Flow<List<Repository>>
    suspend fun addRepository(url: String)
    suspend fun updateRepository(repo: Repository)
    suspend fun deleteRepository(id: Long)
}

interface DownloadManager {
    fun observeQueue(): Flow<List<DownloadTask>>
    suspend fun enqueue(novel: Novel, chapters: List<Chapter>)
    suspend fun cancel(taskId: String)
    suspend fun cancelAll()
}
