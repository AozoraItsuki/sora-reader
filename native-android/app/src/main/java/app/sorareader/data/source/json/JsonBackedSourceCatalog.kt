package app.sorareader.data.source.json

import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.ChapterContent
import app.sorareader.domain.model.Novel
import app.sorareader.domain.model.SourceDescriptor
import app.sorareader.domain.model.SourceNovel
import app.sorareader.domain.repository.SourceCatalog
import kotlinx.serialization.json.Json

/**
 * Skeleton for future simple JSON/HTTP source adapters.
 * MVP keeps DemoSource active; this class documents and enables incremental parity.
 */
class JsonBackedSourceCatalog(
    private val delegate: SourceCatalog,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : SourceCatalog by delegate {
    fun parseManifest(raw: String): JsonSourceManifest = json.decodeFromString(JsonSourceManifest.serializer(), raw)
}
