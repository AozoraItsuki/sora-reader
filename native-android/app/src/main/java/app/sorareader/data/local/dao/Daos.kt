package app.sorareader.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import app.sorareader.data.local.entity.CategoryEntity
import app.sorareader.data.local.entity.ChapterEntity
import app.sorareader.data.local.entity.NovelCategoryEntity
import app.sorareader.data.local.entity.NovelEntity
import app.sorareader.data.local.entity.ReadingHistoryEntity
import app.sorareader.data.local.entity.RepositoryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface NovelDao {
    @Query("SELECT * FROM novels WHERE inLibrary = 1 ORDER BY COALESCE(lastReadAt, lastUpdatedAt, 0) DESC")
    fun observeLibrary(): Flow<List<NovelEntity>>

    @Query("SELECT * FROM novels WHERE inLibrary = 1 AND (:query = '' OR title LIKE '%' || :query || '%') ORDER BY COALESCE(lastReadAt, lastUpdatedAt, 0) DESC")
    fun searchLibrary(query: String): Flow<List<NovelEntity>>

    @Query("SELECT * FROM novels WHERE id = :id")
    fun observeById(id: Long): Flow<NovelEntity?>

    @Query("SELECT * FROM novels WHERE id = :id")
    suspend fun getById(id: Long): NovelEntity?

    @Query("SELECT * FROM novels WHERE sourceId = :sourceId AND url = :url LIMIT 1")
    suspend fun getBySourceUrl(sourceId: String, url: String): NovelEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(novel: NovelEntity): Long

    @Update
    suspend fun update(novel: NovelEntity)

    @Query("UPDATE novels SET inLibrary = :inLibrary WHERE id = :id")
    suspend fun setInLibrary(id: Long, inLibrary: Boolean)

    @Query("UPDATE novels SET lastReadAt = :time WHERE id = :id")
    suspend fun updateLastRead(id: Long, time: Long)

    @Query("UPDATE novels SET lastUpdatedAt = :time WHERE id = :id")
    suspend fun updateLastUpdated(id: Long, time: Long)

    @Query("DELETE FROM novels WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("SELECT COUNT(*) FROM novels WHERE inLibrary = 1")
    fun observeLibraryCount(): Flow<Int>
}

@Dao
interface ChapterDao {
    @Query("SELECT * FROM chapters WHERE novelId = :novelId ORDER BY position ASC, number ASC")
    fun observeByNovel(novelId: Long): Flow<List<ChapterEntity>>

    @Query("SELECT * FROM chapters WHERE novelId = :novelId ORDER BY position ASC, number ASC")
    suspend fun getByNovel(novelId: Long): List<ChapterEntity>

    @Query("SELECT * FROM chapters WHERE id = :id")
    suspend fun getById(id: Long): ChapterEntity?

    @Query("SELECT * FROM chapters WHERE novelId = :novelId AND isRead = 0 ORDER BY position ASC, number ASC LIMIT 1")
    suspend fun getFirstUnread(novelId: Long): ChapterEntity?

    @Query("SELECT * FROM chapters WHERE novelId = :novelId AND isDownloaded = 1 ORDER BY position DESC, number DESC LIMIT 1")
    suspend fun getLastDownloaded(novelId: Long): ChapterEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(chapters: List<ChapterEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(chapter: ChapterEntity): Long

    @Query("UPDATE chapters SET readProgress = :progress, isRead = :isRead WHERE id = :id")
    suspend fun updateProgress(id: Long, progress: Float, isRead: Boolean)

    @Query("UPDATE chapters SET isDownloaded = :downloaded, contentPath = :contentPath WHERE id = :id")
    suspend fun updateDownload(id: Long, downloaded: Boolean, contentPath: String?)

    @Query("UPDATE chapters SET isBookmarked = :bookmarked WHERE id = :id")
    suspend fun updateBookmark(id: Long, bookmarked: Boolean)

    @Query("UPDATE chapters SET isRead = :isRead WHERE novelId = :novelId")
    suspend fun markNovelRead(novelId: Long, isRead: Boolean)

    @Query("SELECT * FROM chapters WHERE novelId = :novelId AND isDownloaded = 1")
    suspend fun getDownloaded(novelId: Long): List<ChapterEntity>

    @Query("SELECT * FROM chapters WHERE isDownloaded = 1 ORDER BY id DESC")
    fun observeAllDownloaded(): Flow<List<ChapterEntity>>

    @Query("DELETE FROM chapters WHERE novelId = :novelId")
    suspend fun deleteByNovel(novelId: Long)

    @Query("SELECT COUNT(*) FROM chapters WHERE novelId = :novelId")
    suspend fun countByNovel(novelId: Long): Int

    @Query("SELECT COUNT(*) FROM chapters WHERE novelId = :novelId AND isRead = 0")
    suspend fun countUnreadByNovel(novelId: Long): Int

    @Query("SELECT COUNT(*) FROM chapters WHERE novelId = :novelId AND isDownloaded = 1")
    suspend fun countDownloadedByNovel(novelId: Long): Int
}

@Dao
interface CategoryDao {
    @Query("SELECT * FROM categories ORDER BY sort ASC, name ASC")
    fun observeAll(): Flow<List<CategoryEntity>>

    @Query("SELECT * FROM categories ORDER BY sort ASC, name ASC")
    suspend fun getAll(): List<CategoryEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(category: CategoryEntity): Long

    @Update
    suspend fun update(category: CategoryEntity)

    @Query("DELETE FROM categories WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("SELECT categoryId FROM novel_categories WHERE novelId = :novelId")
    suspend fun getNovelCategoryIds(novelId: Long): List<Long>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertNovelCategory(nc: NovelCategoryEntity)

    @Query("DELETE FROM novel_categories WHERE novelId = :novelId AND categoryId = :categoryId")
    suspend fun removeNovelCategory(novelId: Long, categoryId: Long)

    @Query("DELETE FROM novel_categories WHERE novelId = :novelId")
    suspend fun clearNovelCategories(novelId: Long)

    @Transaction
    suspend fun ensureDefault() {
        insert(CategoryEntity(id = 1, name = "Default", sort = 0))
        insert(CategoryEntity(id = 2, name = "Local", sort = 1))
    }
}

@Dao
interface RepositoryDao {
    @Query("SELECT * FROM repositories ORDER BY id ASC")
    fun observeAll(): Flow<List<RepositoryEntity>>

    @Query("SELECT * FROM repositories WHERE enabled = 1 ORDER BY id ASC")
    suspend fun getEnabled(): List<RepositoryEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(repo: RepositoryEntity): Long

    @Update
    suspend fun update(repo: RepositoryEntity)

    @Query("DELETE FROM repositories WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface HistoryDao {
    @Query("""
        SELECT c.id as chapterId, c.novelId, n.title as novelTitle, n.coverUrl as novelCover,
               c.title as chapterTitle, c.number as chapterNumber, h.readAt as readAt,
               c.readProgress as readProgress, n.sourceId as sourceId, n.url as novelUrl
        FROM reading_history h
        JOIN chapters c ON c.id = h.chapterId
        JOIN novels n ON n.id = c.novelId
        ORDER BY h.readAt DESC
        LIMIT :limit
    """)
    fun observeHistory(limit: Int = 200): Flow<List<HistoryRow>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: ReadingHistoryEntity)

    @Query("DELETE FROM reading_history WHERE chapterId = :chapterId")
    suspend fun delete(chapterId: Long)

    @Query("DELETE FROM reading_history")
    suspend fun clearAll()
}

data class HistoryRow(
    val chapterId: Long,
    val novelId: Long,
    val novelTitle: String,
    val novelCover: String?,
    val chapterTitle: String,
    val chapterNumber: Float,
    val readAt: Long,
    val readProgress: Float,
    val sourceId: String,
    val novelUrl: String,
)
