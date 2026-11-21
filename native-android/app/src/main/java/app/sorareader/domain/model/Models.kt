package app.sorareader.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class Novel(
    val id: Long = 0,
    val sourceId: String,
    val url: String,
    val title: String,
    val author: String = "",
    val artist: String = "",
    val coverUrl: String? = null,
    val description: String = "",
    val status: NovelStatus = NovelStatus.UNKNOWN,
    val genres: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val inLibrary: Boolean = false,
    val isLocal: Boolean = false,
    val totalChapters: Int = 0,
    val chaptersDownloaded: Int = 0,
    val chaptersUnread: Int = 0,
    val lastReadAt: Long? = null,
    val lastUpdatedAt: Long? = null,
)

@Serializable
enum class NovelStatus { UNKNOWN, ONGOING, COMPLETED, LICENSED, PUBLISHING_FINISHED, CANCELLED, ON_HIATUS }

@Serializable
data class Chapter(
    val id: Long = 0,
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

@Serializable
data class Category(
    val id: Long = 0,
    val name: String,
    val sort: Int = 0,
)

@Serializable
data class NovelCategory(val novelId: Long, val categoryId: Long)

@Serializable
data class Repository(val id: Long = 0, val url: String, val enabled: Boolean = true)

@Serializable
data class SourceDescriptor(
    val id: String,
    val name: String,
    val lang: String = "multi",
    val version: String = "1.0.0",
    val site: String = "",
    val iconUrl: String? = null,
    val hasSettings: Boolean = false,
    val isInstalled: Boolean = false,
)

@Serializable
data class SourceNovel(
    val sourceId: String,
    val url: String,
    val title: String,
    val author: String = "",
    val artist: String = "",
    val coverUrl: String? = null,
    val description: String = "",
    val status: NovelStatus = NovelStatus.UNKNOWN,
    val genres: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val chapters: List<Chapter> = emptyList(),
    val totalPages: Int = 1,
)

@Serializable
data class PluginManifest(
    val id: String,
    val name: String,
    val site: String,
    val lang: String = "en",
    val version: String,
    val url: String,
    val iconUrl: String? = null,
    val customJS: String? = null,
    val customCSS: String? = null,
    val hasSettings: Boolean = false,
)

@Serializable
data class HistoryEntry(
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

data class ChapterContent(val chapterId: Long, val title: String, val paragraphs: List<String>, val html: String? = null)

data class DownloadTask(
    val id: String,
    val chapterId: Long,
    val novelId: Long,
    val novelTitle: String,
    val chapterTitle: String,
    val status: DownloadStatus = DownloadStatus.QUEUED,
    val progress: Float = 0f,
    val error: String? = null,
)

enum class DownloadStatus { QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED }

data class BackupOptions(
    val novels: Boolean = true,
    val categories: Boolean = true,
    val repositories: Boolean = true,
    val settings: Boolean = true,
)
