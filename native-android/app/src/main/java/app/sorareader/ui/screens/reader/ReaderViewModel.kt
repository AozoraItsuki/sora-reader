package app.sorareader.ui.screens.reader

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.ChapterContent
import app.sorareader.domain.repository.NovelRepository
import app.sorareader.domain.repository.SourceCatalog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File

data class ReaderUiState(
    val chapter: Chapter? = null,
    val content: ChapterContent? = null,
    val loading: Boolean = false,
    val error: String? = null,
    val fontSize: Float = 16f,
    val lineHeight: Float = 1.6f,
)

class ReaderViewModel(
    private val repo: NovelRepository,
    private val catalog: SourceCatalog,
    private val appContext: Context,
) : ViewModel() {
    private val _state = MutableStateFlow(ReaderUiState())
    val state: StateFlow<ReaderUiState> = _state.asStateFlow()

    fun load(novelId: Long, chapterId: Long) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            runCatching {
                val chapter = repo.getChapterById(chapterId) ?: error("Chapter not found")
                val novel = repo.getNovelById(novelId) ?: error("Novel not found")
                val content = loadContent(chapter, novel.sourceId)
                repo.recordHistory(chapter.id)
                _state.value = _state.value.copy(chapter = chapter, content = content, loading = false)
            }.onFailure {
                _state.value = _state.value.copy(loading = false, error = it.message ?: "Failed to load chapter")
            }
        }
    }

    private suspend fun loadContent(chapter: Chapter, sourceId: String): ChapterContent {
        chapter.contentPath?.let { path -> File(path).takeIf { it.exists() }?.let {
            return ChapterContent(chapter.id, chapter.title, it.readLines().filter { l -> l.isNotBlank() })
        } }
        val remote = catalog.fetchChapterContent(sourceId, chapter.url)
        val dir = File(appContext.filesDir, "downloads/${chapter.novelId}").also { it.mkdirs() }
        val file = File(dir, "${chapter.id}.txt")
        file.writeText(remote.paragraphs.joinToString("\n\n"))
        repo.markChapterDownloaded(chapter.id, true, file.absolutePath)
        return remote.copy(chapterId = chapter.id)
    }

    fun onProgress(progress: Float) {
        val chapter = _state.value.chapter ?: return
        viewModelScope.launch {
            val clamped = progress.coerceIn(0f, 1f)
            repo.updateChapterProgress(chapter.id, clamped, clamped >= 0.97f)
            _state.value = _state.value.copy(chapter = chapter.copy(readProgress = clamped, isRead = clamped >= 0.97f))
        }
    }
}
