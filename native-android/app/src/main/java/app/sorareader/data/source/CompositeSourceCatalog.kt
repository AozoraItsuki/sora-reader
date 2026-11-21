package app.sorareader.data.source

import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.ChapterContent
import app.sorareader.domain.model.Novel
import app.sorareader.domain.model.SourceDescriptor
import app.sorareader.domain.model.SourceNovel
import app.sorareader.domain.repository.SourceCatalog

class CompositeSourceCatalog(private val delegates: List<SourceCatalog>) : SourceCatalog {
    override fun availableSources(): List<SourceDescriptor> = delegates.flatMap { it.availableSources() }.distinctBy { it.id }
    override suspend fun browse(sourceId: String, query: String, page: Int): List<Novel> = delegateFor(sourceId)?.browse(sourceId, query, page) ?: emptyList()
    override suspend fun fetchNovelDetails(sourceId: String, novelUrl: String): SourceNovel = delegateFor(sourceId)?.fetchNovelDetails(sourceId, novelUrl) ?: error("Unknown source: $sourceId")
    override suspend fun fetchChapters(sourceId: String, novelUrl: String): List<Chapter> = delegateFor(sourceId)?.fetchChapters(sourceId, novelUrl) ?: emptyList()
    override suspend fun fetchChapterContent(sourceId: String, chapterUrl: String): ChapterContent = delegateFor(sourceId)?.fetchChapterContent(sourceId, chapterUrl) ?: error("Unknown source: $sourceId")
    private fun delegateFor(sourceId: String): SourceCatalog? = delegates.firstOrNull { d -> d.availableSources().any { it.id == sourceId } }
}
