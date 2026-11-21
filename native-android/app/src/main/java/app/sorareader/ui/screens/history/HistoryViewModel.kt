package app.sorareader.ui.screens.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.domain.model.HistoryEntry
import app.sorareader.domain.repository.NovelRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class HistoryViewModel(private val repo: NovelRepository) : ViewModel() {
    val history: StateFlow<List<HistoryEntry>> = repo.observeHistory()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    fun delete(chapterId: Long) = viewModelScope.launch { repo.deleteHistory(chapterId) }
    fun clear() = viewModelScope.launch { repo.clearHistory() }
}
