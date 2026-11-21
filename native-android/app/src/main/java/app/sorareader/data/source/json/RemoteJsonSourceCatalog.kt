package app.sorareader.data.source.json

import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.ChapterContent
import app.sorareader.domain.model.Novel
import app.sorareader.domain.model.NovelStatus
import app.sorareader.domain.model.SourceDescriptor
import app.sorareader.domain.model.SourceNovel
import app.sorareader.domain.repository.SourceCatalog
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class RemoteJsonSourceCatalog(
    private val client: HttpClient,
    private val manifestUrl: String,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : SourceCatalog {
    private var cached: JsonSourcePayload? = null

    private suspend fun load(): JsonSourcePayload {
        cached?.let { return it }
        val text = client.get(manifestUrl).bodyAsText()
        return json.decodeFromString(JsonSourcePayload.serializer(), text).also { cached = it }
    }

    override fun availableSources(): List<SourceDescriptor> = listOf(
        SourceDescriptor(id = manifestUrl.hashCode().toString(), name = "JSON: $manifestUrl", lang = "multi", site = manifestUrl, isInstalled = true)
    )

    override suspend fun browse(sourceId: String, query: String, page: Int): List<Novel> {
        val payload = load()
        val q = query.trim().lowercase()
        return payload.novels.filter { q.isBlank() || it.title.lowercase().contains(q) || it.author.lowercase().contains(q) }.map { it.toDomain(payload.id) }
    }

    override suspend fun fetchNovelDetails(sourceId: String, novelUrl: String): SourceNovel {
        val payload = load()
        val n = payload.novels.first { it.url == novelUrl }
        val chapters = n.chapters.mapIndexed { i, c -> c.toDomain(0, i) }
        return SourceNovel(sourceId = payload.id, url = n.url, title = n.title, author = n.author, artist = n.artist, coverUrl = n.coverUrl, description = n.description, status = runCatching { NovelStatus.valueOf(n.status.uppercase()) }.getOrDefault(NovelStatus.UNKNOWN), genres = n.genres, tags = n.tags, chapters = chapters)
    }

    override suspend fun fetchChapters(sourceId: String, novelUrl: String): List<Chapter> = fetchNovelDetails(sourceId, novelUrl).chapters
    override suspend fun fetchChapterContent(sourceId: String, chapterUrl: String): ChapterContent {
        val payload = load()
        val chapter = payload.novels.flatMap { it.chapters }.first { it.url == chapterUrl }
        return ChapterContent(chapterId = chapter.url.hashCode().toLong(), title = chapter.title, paragraphs = chapter.content.ifBlank { listOf("No content.") })
    }
}

@Serializable
data class JsonSourcePayload(
    val id: String,
    val name: String,
    val novels: List<JsonNovelPayload> = emptyList(),
)

@Serializable
data class JsonNovelPayload(
    val url: String, val title: String, val author: String = "", val artist: String = "",
    val coverUrl: String? = null, val description: String = "", val status: String = "UNKNOWN",
    val genres: List<String> = emptyList(), val tags: List<String> = emptyList(),
    val chapters: List<JsonChapterPayload> = emptyList(),
) { fun toDomain(sourceId: String) = Novel(sourceId = sourceId, url = url, title = title, author = author, artist = artist, coverUrl = coverUrl, description = description, status = runCatching { NovelStatus.valueOf(status.uppercase()) }.getOrDefault(NovelStatus.UNKNOWN), genres = genres, tags = tags) }

@Serializable
data class JsonChapterPayload(
    val url: String, val title: String, val number: Float = 0f, @SerialName("content") val content: List<String> = emptyList(),
) { fun toDomain(novelId: Long, index: Int) = Chapter(novelId = novelId, url = url, title = title, number = number, position = index) }
