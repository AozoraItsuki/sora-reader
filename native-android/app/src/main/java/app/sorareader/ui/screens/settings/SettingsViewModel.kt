package app.sorareader.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sorareader.data.settings.AppPreferences
import app.sorareader.data.settings.AppSettingsStore
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(private val store: AppSettingsStore) : ViewModel() {
    val prefs: StateFlow<AppPreferences> = store.preferences
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppPreferences())

    fun setDynamicColor(v: Boolean) = viewModelScope.launch { store.setDynamicColor(v) }
    fun setAmoled(v: Boolean) = viewModelScope.launch { store.setAmoled(v) }
    fun setIncognito(v: Boolean) = viewModelScope.launch { store.setIncognito(v) }
    fun setWifiOnly(v: Boolean) = viewModelScope.launch { store.setWifiOnly(v) }
    fun setFontSize(v: Float) = viewModelScope.launch { store.setFontSize(v) }
    fun setLineHeight(v: Float) = viewModelScope.launch { store.setLineHeight(v) }
}
