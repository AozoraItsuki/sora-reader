package app.sorareader.ui.screens.updates

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.domain.model.Novel
import app.sorareader.domain.repository.NovelRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

class UpdatesViewModel(repo: NovelRepository) : ViewModel() {
    val updates: StateFlow<List<Novel>> = repo.observeLibrary()
        .map { list -> list.filter { it.lastUpdatedAt != null }.sortedByDescending { it.lastUpdatedAt } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
