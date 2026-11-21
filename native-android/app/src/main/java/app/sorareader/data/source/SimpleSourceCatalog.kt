package app.sorareader.data.source

import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.ChapterContent
import app.sorareader.domain.model.Novel
import app.sorareader.domain.model.NovelStatus
import app.sorareader.domain.model.SourceDescriptor
import app.sorareader.domain.model.SourceNovel
import app.sorareader.domain.repository.SourceCatalog
import kotlinx.coroutines.delay

class SimpleSourceCatalog : SourceCatalog {
    private val demo = SourceDescriptor(id = "demo", name = "Demo Source", lang = "en", version = "1.0.0", site = "demo://", isInstalled = true)

    private val demoNovels = listOf(
        Novel(sourceId = "demo", url = "demo://novel/sky-archive", title = "The Sky Archive", author = "Sora Team",
            description = "A sample novel bundled for MVP validation.", status = NovelStatus.ONGOING, genres = listOf("Fantasy", "Adventure")),
        Novel(sourceId = "demo", url = "demo://novel/quiet-engine", title = "Quiet Engine", author = "Sora Team",
            description = "A short demo story showing the reader and progress tracking.", status = NovelStatus.COMPLETED, genres = listOf("Sci-Fi")),
    )

    override fun availableSources(): List<SourceDescriptor> = listOf(demo)

    override suspend fun browse(sourceId: String, query: String, page: Int): List<Novel> {
        delay(120)
        if (sourceId != demo.id || page > 1) return emptyList()
        val q = query.trim().lowercase()
        return demoNovels.filter { q.isBlank() || it.title.lowercase().contains(q) || it.author.lowercase().contains(q) }
    }

    override suspend fun fetchNovelDetails(sourceId: String, novelUrl: String): SourceNovel {
        val novel = demoNovels.firstOrNull { it.url == novelUrl } ?: error("Novel not found")
        return SourceNovel(
            sourceId = novel.sourceId, url = novel.url, title = novel.title, author = novel.author,
            coverUrl = novel.coverUrl, description = novel.description, status = novel.status,
            genres = novel.genres, chapters = fetchChapters(sourceId, novelUrl),
        )
    }

    override suspend fun fetchChapters(sourceId: String, novelUrl: String): List<Chapter> {
        val count = if (novelUrl.endsWith("sky-archive")) 12 else 6
        return (1..count).map { i ->
            Chapter(novelId = 0, url = "$novelUrl/chapter/$i", title = "Chapter $i", number = i.toFloat(), position = i)
        }
    }

    override suspend fun fetchChapterContent(sourceId: String, chapterUrl: String): ChapterContent {
        val chapterNum = chapterUrl.substringAfterLast("/").toLongOrNull() ?: 0L
        val title = "Chapter $chapterNum"
        val body = buildList {
            add("$title — SoraReader Native")
            add("This is demo content for the native rebuild.")
            repeat(8) { idx ->
                add("Paragraph ${idx + 1}. The reader stores progress locally and supports offline content. Replace DemoSource with real source adapters implementing SourceCatalog.")
            }
        }
        return ChapterContent(chapterId = chapterNum, title = title, paragraphs = body)
    }
}
