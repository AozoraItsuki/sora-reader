package app.sorareader.ui.screens.categories

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.domain.model.Category
import app.sorareader.domain.repository.NovelRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CategoriesViewModel(private val repo: NovelRepository) : ViewModel() {
    val categories: StateFlow<List<Category>> = repo.observeCategories().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    fun add(name: String) = viewModelScope.launch { if (name.isNotBlank()) repo.addCategory(name.trim()) }
    fun delete(id: Long) = viewModelScope.launch { repo.deleteCategory(id) }
}
