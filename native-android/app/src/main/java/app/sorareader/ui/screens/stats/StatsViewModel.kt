package app.sorareader.ui.screens.stats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.domain.repository.NovelRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

data class StatsUiState(val novelsInLibrary: Int = 0, val downloadedChapters: Int = 0, val historyEntries: Int = 0)
class StatsViewModel(repo: NovelRepository) : ViewModel() {
    val state: StateFlow<StatsUiState> = combine(repo.observeLibrary(), repo.observeDownloaded(), repo.observeHistory()) { lib, dl, hist ->
        StatsUiState(lib.size, dl.size, hist.size)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), StatsUiState())
}
