package app.sorareader.ui.screens.browse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.domain.model.Novel
import app.sorareader.domain.model.SourceDescriptor
import app.sorareader.domain.repository.NovelRepository
import app.sorareader.domain.repository.SourceCatalog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class BrowseUiState(
    val sources: List<SourceDescriptor> = emptyList(),
    val selectedSourceId: String? = null,
    val query: String = "",
    val results: List<Novel> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

class BrowseViewModel(
    private val novelRepo: NovelRepository,
    private val catalog: SourceCatalog,
) : ViewModel() {
    private val _state = MutableStateFlow(BrowseUiState())
    val state: StateFlow<BrowseUiState> = _state.asStateFlow()

    init { refreshSources() }

    fun refreshSources() {
        viewModelScope.launch {
            val sources = runCatching {
                val c = catalog
                if (c is app.sorareader.data.source.RepositoryBackedSourceCatalog) c.availableSourcesAsync() else c.availableSources()
            }.getOrElse { catalog.availableSources() }
            val selected = _state.value.selectedSourceId ?: sources.firstOrNull()?.id
            _state.value = _state.value.copy(sources = sources, selectedSourceId = selected)
            search()
        }
    }

    fun onQueryChange(q: String) { _state.value = _state.value.copy(query = q) }
    fun onSourceSelect(id: String) { _state.value = _state.value.copy(selectedSourceId = id); search() }

    fun search() {
        val sourceId = _state.value.selectedSourceId ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            runCatching { catalog.browse(sourceId, _state.value.query) }
                .onSuccess { _state.value = _state.value.copy(results = it, loading = false) }
                .onFailure { _state.value = _state.value.copy(error = it.message, loading = false) }
        }
    }

    fun addToLibrary(novel: Novel, onAdded: (Long) -> Unit) {
        viewModelScope.launch {
            val id = novelRepo.upsertNovel(novel.copy(inLibrary = true, lastUpdatedAt = System.currentTimeMillis()))
            onAdded(id)
        }
    }
}
