package app.sorareader.data.source.json

import kotlinx.serialization.Serializable

/**
 * Simple MVP source format. This is intentionally not the old JS plugin runtime.
 * It can be hosted as JSON and mapped to SourceCatalog.
 */
@Serializable
data class JsonSourceManifest(
    val id: String,
    val name: String,
    val lang: String = "en",
    val version: String = "1.0.0",
    val site: String = "",
    val endpoints: JsonSourceEndpoints? = null,
)

@Serializable
data class JsonSourceEndpoints(
    val browse: String? = null,
    val search: String? = null,
    val novel: String? = null,
    val chapters: String? = null,
    val content: String? = null,
)
