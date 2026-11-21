package app.sorareader.ui.screens.downloads

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.domain.model.DownloadTask
import app.sorareader.domain.repository.DownloadManager
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class DownloadsViewModel(private val dm: DownloadManager) : ViewModel() {
    val queue: StateFlow<List<DownloadTask>> = dm.observeQueue()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    fun cancel(taskId: String) = viewModelScope.launch { dm.cancel(taskId) }
    fun cancelAll() = viewModelScope.launch { dm.cancelAll() }
}
