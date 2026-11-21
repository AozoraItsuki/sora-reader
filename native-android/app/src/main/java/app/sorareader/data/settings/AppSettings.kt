package app.sorareader.data.settings

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("sora_settings")

data class ReaderSettings(
    val fontSize: Float = 16f,
    val lineHeight: Float = 1.6f,
    val padding: Int = 16,
    val keepScreenOn: Boolean = true,
    val fullscreen: Boolean = true,
    val theme: String = "system",
)

data class AppPreferences(
    val dynamicColor: Boolean = true,
    val amoled: Boolean = false,
    val incognito: Boolean = false,
    val wifiOnlyDownloads: Boolean = true,
    val reader: ReaderSettings = ReaderSettings(),
)

class AppSettingsStore(private val context: Context) {
    private object K {
        val dynamicColor = booleanPreferencesKey("dynamic_color")
        val amoled = booleanPreferencesKey("amoled")
        val incognito = booleanPreferencesKey("incognito")
        val wifiOnly = booleanPreferencesKey("wifi_only")
        val fontSize = floatPreferencesKey("reader_font_size")
        val lineHeight = floatPreferencesKey("reader_line_height")
        val padding = intPreferencesKey("reader_padding")
        val keepScreenOn = booleanPreferencesKey("reader_keep_screen_on")
        val fullscreen = booleanPreferencesKey("reader_fullscreen")
        val readerTheme = stringPreferencesKey("reader_theme")
    }

    val preferences: Flow<AppPreferences> = context.dataStore.data.map { p ->
        AppPreferences(
            dynamicColor = p[K.dynamicColor] ?: true,
            amoled = p[K.amoled] ?: false,
            incognito = p[K.incognito] ?: false,
            wifiOnlyDownloads = p[K.wifiOnly] ?: true,
            reader = ReaderSettings(
                fontSize = p[K.fontSize] ?: 16f,
                lineHeight = p[K.lineHeight] ?: 1.6f,
                padding = p[K.padding] ?: 16,
                keepScreenOn = p[K.keepScreenOn] ?: true,
                fullscreen = p[K.fullscreen] ?: true,
                theme = p[K.readerTheme] ?: "system",
            ),
        )
    }

    suspend fun setDynamicColor(v: Boolean) = context.dataStore.edit { it[K.dynamicColor] = v }
    suspend fun setAmoled(v: Boolean) = context.dataStore.edit { it[K.amoled] = v }
    suspend fun setIncognito(v: Boolean) = context.dataStore.edit { it[K.incognito] = v }
    suspend fun setWifiOnly(v: Boolean) = context.dataStore.edit { it[K.wifiOnly] = v }
    suspend fun setFontSize(v: Float) = context.dataStore.edit { it[K.fontSize] = v }
    suspend fun setLineHeight(v: Float) = context.dataStore.edit { it[K.lineHeight] = v }
}
