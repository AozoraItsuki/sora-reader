package app.sorareader.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import app.sorareader.domain.model.Category
import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.HistoryEntry
import app.sorareader.domain.model.Novel
import app.sorareader.domain.model.NovelCategory
import app.sorareader.domain.model.NovelStatus
import app.sorareader.domain.model.Repository

@Entity(
    tableName = "novels",
    indices = [Index(value = ["sourceId", "url"], unique = true), Index("inLibrary"), Index("lastReadAt"), Index("lastUpdatedAt")],
)
data class NovelEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sourceId: String,
    val url: String,
    val title: String,
    val author: String = "",
    val artist: String = "",
    val coverUrl: String? = null,
    val description: String = "",
    val status: String = NovelStatus.UNKNOWN.name,
    val genres: String = "",
    val tags: String = "",
    val inLibrary: Boolean = false,
    val isLocal: Boolean = false,
    val totalChapters: Int = 0,
    val chaptersDownloaded: Int = 0,
    val chaptersUnread: Int = 0,
    val lastReadAt: Long? = null,
    val lastUpdatedAt: Long? = null,
)

@Entity(
    tableName = "chapters",
    indices = [Index(value = ["novelId", "url"], unique = true), Index("novelId"), Index("position"), Index("isRead"), Index("isDownloaded")],
)
data class ChapterEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val novelId: Long,
    val url: String,
    val title: String,
    val number: Float = 0f,
    val releaseDate: String? = null,
    val readProgress: Float = 0f,
    val isRead: Boolean = false,
    val isDownloaded: Boolean = false,
    val isBookmarked: Boolean = false,
    val contentPath: String? = null,
    val position: Int = 0,
    val page: String = "1",
    val updatedTime: String? = null,
)

@Entity(tableName = "categories", indices = [Index(value = ["name"], unique = true)])
data class CategoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val sort: Int = 0,
)

@Entity(
    tableName = "novel_categories",
    primaryKeys = ["novelId", "categoryId"],
    indices = [Index("categoryId"), Index("novelId")],
)
data class NovelCategoryEntity(val novelId: Long, val categoryId: Long)

@Entity(tableName = "repositories", indices = [Index(value = ["url"], unique = true)])
data class RepositoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val url: String,
    val enabled: Boolean = true,
)

@Entity(
    tableName = "reading_history",
    foreignKeys = [ForeignKey(entity = ChapterEntity::class, parentColumns = ["id"], childColumns = ["chapterId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("chapterId"), Index("readAt")],
)
data class ReadingHistoryEntity(
    @PrimaryKey val chapterId: Long,
    val readAt: Long,
    val readDuration: Long = 0,
)

fun NovelEntity.toDomain() = Novel(
    id = id, sourceId = sourceId, url = url, title = title, author = author, artist = artist,
    coverUrl = coverUrl, description = description,
    status = runCatching { NovelStatus.valueOf(status) }.getOrDefault(NovelStatus.UNKNOWN),
    genres = genres.decodeList(), tags = tags.decodeList(),
    inLibrary = inLibrary, isLocal = isLocal,
    totalChapters = totalChapters, chaptersDownloaded = chaptersDownloaded, chaptersUnread = chaptersUnread,
    lastReadAt = lastReadAt, lastUpdatedAt = lastUpdatedAt,
)

fun Novel.toEntity() = NovelEntity(
    id = id, sourceId = sourceId, url = url, title = title, author = author, artist = artist,
    coverUrl = coverUrl, description = description, status = status.name,
    genres = genres.encodeList(), tags = tags.encodeList(),
    inLibrary = inLibrary, isLocal = isLocal,
    totalChapters = totalChapters, chaptersDownloaded = chaptersDownloaded, chaptersUnread = chaptersUnread,
    lastReadAt = lastReadAt, lastUpdatedAt = lastUpdatedAt,
)

fun ChapterEntity.toDomain() = Chapter(
    id = id, novelId = novelId, url = url, title = title, number = number,
    releaseDate = releaseDate, readProgress = readProgress, isRead = isRead,
    isDownloaded = isDownloaded, isBookmarked = isBookmarked, contentPath = contentPath,
    position = position, page = page, updatedTime = updatedTime,
)

fun Chapter.toEntity() = ChapterEntity(
    id = id, novelId = novelId, url = url, title = title, number = number,
    releaseDate = releaseDate, readProgress = readProgress, isRead = isRead,
    isDownloaded = isDownloaded, isBookmarked = isBookmarked, contentPath = contentPath,
    position = position, page = page, updatedTime = updatedTime,
)

fun CategoryEntity.toDomain() = Category(id = id, name = name, sort = sort)
fun Category.toEntity() = CategoryEntity(id = id, name = name, sort = sort)
fun NovelCategoryEntity.toDomain() = NovelCategory(novelId, categoryId)
fun RepositoryEntity.toDomain() = Repository(id = id, url = url, enabled = enabled)
fun Repository.toEntity() = RepositoryEntity(id = id, url = url, enabled = enabled)

private fun List<String>.encodeList() = joinToString("|") { it.replace("|", " ") }
private fun String.decodeList() = split("|").map { it.trim() }.filter { it.isNotEmpty() }
