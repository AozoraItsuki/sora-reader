package app.sorareader.ui.screens.novel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.Novel
import app.sorareader.domain.repository.NovelRepository
import app.sorareader.domain.repository.DownloadManager
import app.sorareader.domain.repository.SourceCatalog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

data class NovelDetailUiState(
    val categories: List<app.sorareader.domain.model.Category> = emptyList(),
    val selectedCategoryIds: Set<Long> = emptySet(),
    val showCategoryDialog: Boolean = false,
    val novel: Novel? = null,
    val chapters: List<Chapter> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

class NovelDetailViewModel(
    private val repo: NovelRepository,
    private val catalog: SourceCatalog,
    private val downloads: DownloadManager,
) : ViewModel() {
    private val _state = MutableStateFlow(NovelDetailUiState())
    val state: StateFlow<NovelDetailUiState> = _state.asStateFlow()

    fun load(novelId: Long) {
        viewModelScope.launch { repo.observeNovel(novelId).collectLatest { _state.value = _state.value.copy(novel = it) } }
        viewModelScope.launch { repo.observeChapters(novelId).collectLatest { _state.value = _state.value.copy(chapters = it) } }
        viewModelScope.launch { repo.observeCategories().collectLatest { _state.value = _state.value.copy(categories = it) } }
        viewModelScope.launch { refresh(novelId, silent = true) }
    }

    fun refresh(novelId: Long, silent: Boolean = false) {
        viewModelScope.launch {
            val novel = repo.getNovelById(novelId) ?: return@launch
            if (!silent) _state.value = _state.value.copy(loading = true, error = null)
            runCatching {
                val details = catalog.fetchNovelDetails(novel.sourceId, novel.url)
                val chapters = catalog.fetchChapters(novel.sourceId, novel.url).mapIndexed { idx, ch -> ch.copy(novelId = novelId, position = idx) }
                repo.upsertNovel(novel.copy(
                    title = details.title.ifBlank { novel.title },
                    author = details.author, artist = details.artist, description = details.description,
                    coverUrl = details.coverUrl ?: novel.coverUrl, status = details.status,
                    genres = details.genres, tags = details.tags, lastUpdatedAt = System.currentTimeMillis(),
                ))
                val existing = repo.getChapters(novelId).associateBy { it.url }
                repo.upsertChapters(chapters.map { fresh ->
                    existing[fresh.url]?.let { old -> fresh.copy(id = old.id, readProgress = old.readProgress, isRead = old.isRead, isDownloaded = old.isDownloaded, contentPath = old.contentPath, isBookmarked = old.isBookmarked) } ?: fresh
                })
            }.onFailure { if (!silent) _state.value = _state.value.copy(error = it.message) }
            _state.value = _state.value.copy(loading = false)
        }
    }

    fun toggleLibrary() {
        val novel = _state.value.novel ?: return
        viewModelScope.launch { repo.setInLibrary(novel.id, !novel.inLibrary) }
    }

    fun markAllRead(read: Boolean) {
        val novel = _state.value.novel ?: return
        viewModelScope.launch { repo.markNovelRead(novel.id, read) }
    }

    fun downloadUnread() {
        val novel = _state.value.novel ?: return
        val chapters = _state.value.chapters.filter { !it.isDownloaded }
        if (chapters.isEmpty()) return
        viewModelScope.launch { downloads.enqueue(novel, chapters) }
    }

    fun openCategories() {
        val novel = _state.value.novel ?: return
        viewModelScope.launch {
            val selected = repo.getNovelCategoryIds(novel.id).toSet()
            _state.value = _state.value.copy(selectedCategoryIds = selected, showCategoryDialog = true)
        }
    }
    fun toggleCategory(id: Long) { val s=_state.value.selectedCategoryIds; _state.value=_state.value.copy(selectedCategoryIds = if (id in s) s-id else s+id) }
    fun dismissCategories() { _state.value = _state.value.copy(showCategoryDialog = false) }
    fun saveCategories() {
        val novel = _state.value.novel ?: return
        viewModelScope.launch { repo.setNovelCategories(novel.id, _state.value.selectedCategoryIds); _state.value = _state.value.copy(showCategoryDialog = false) }
    }
}
