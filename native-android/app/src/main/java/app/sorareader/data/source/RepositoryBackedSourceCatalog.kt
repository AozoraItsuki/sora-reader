package app.sorareader.data.source

import app.sorareader.data.source.json.RemoteJsonSourceCatalog
import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.ChapterContent
import app.sorareader.domain.model.Novel
import app.sorareader.domain.model.SourceDescriptor
import app.sorareader.domain.model.SourceNovel
import app.sorareader.domain.repository.RepositoryStore
import app.sorareader.domain.repository.SourceCatalog
import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json

class RepositoryBackedSourceCatalog(
    private val repositoryStore: RepositoryStore,
    private val client: HttpClient,
    private val json: Json = Json { ignoreUnknownKeys = true },
    private val builtIn: SourceCatalog = SimpleSourceCatalog(),
) : SourceCatalog {
    private suspend fun delegates(): List<SourceCatalog> {
        val repos = repositoryStore.observeRepositories().first().filter { it.enabled }
        val remotes = repos.map { RemoteJsonSourceCatalog(client, it.url, json) }
        return listOf(builtIn) + remotes
    }

    override fun availableSources(): List<SourceDescriptor> = builtIn.availableSources()
    suspend fun availableSourcesAsync(): List<SourceDescriptor> = CompositeSourceCatalog(delegates()).availableSources()
    override suspend fun browse(sourceId: String, query: String, page: Int): List<Novel> = CompositeSourceCatalog(delegates()).browse(sourceId, query, page)
    override suspend fun fetchNovelDetails(sourceId: String, novelUrl: String): SourceNovel = CompositeSourceCatalog(delegates()).fetchNovelDetails(sourceId, novelUrl)
    override suspend fun fetchChapters(sourceId: String, novelUrl: String): List<Chapter> = CompositeSourceCatalog(delegates()).fetchChapters(sourceId, novelUrl)
    override suspend fun fetchChapterContent(sourceId: String, chapterUrl: String): ChapterContent = CompositeSourceCatalog(delegates()).fetchChapterContent(sourceId, chapterUrl)
}
