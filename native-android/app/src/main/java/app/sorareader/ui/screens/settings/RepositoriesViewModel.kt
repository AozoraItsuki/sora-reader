package app.sorareader.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.domain.model.Repository
import app.sorareader.domain.repository.RepositoryStore
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class RepositoriesViewModel(private val store: RepositoryStore) : ViewModel() {
    val repos: StateFlow<List<Repository>> = store.observeRepositories()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    fun add(url: String) = viewModelScope.launch { if (url.isNotBlank()) store.addRepository(url) }
    fun delete(id: Long) = viewModelScope.launch { store.deleteRepository(id) }
}
