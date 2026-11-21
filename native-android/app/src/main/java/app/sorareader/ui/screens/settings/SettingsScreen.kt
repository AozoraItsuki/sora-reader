package app.sorareader.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.sorareader.ui.AppViewModelProvider

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit, vm: SettingsViewModel = viewModel(factory = AppViewModelProvider.Factory)) {
    val prefs by vm.prefs.collectAsStateWithLifecycle()
    Scaffold(topBar = { LargeTopAppBar(title = { Text("Settings") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }) }) { inner ->
        Column(Modifier.fillMaxSize().padding(inner).verticalScroll(rememberScrollState())) {
            Section("Appearance")
            Toggle("Dynamic color", "Use Material You colors on Android 12+", prefs.dynamicColor, vm::setDynamicColor)
            Toggle("AMOLED dark", "Use pure black in dark mode", prefs.amoled, vm::setAmoled)
            Section("Library")
            Toggle("Incognito mode", "Pause reading history while enabled", prefs.incognito, vm::setIncognito)
            Section("Downloads")
            Toggle("Wi-Fi only", "Download chapters only on Wi-Fi", prefs.wifiOnlyDownloads, vm::setWifiOnly)
            Section("Reader")
            ListItem(headlineContent = { Text("Font size") }, supportingContent = { Text("${prefs.reader.fontSize.toInt()}sp") })
            ListItem(headlineContent = { Text("Line height") }, supportingContent = { Text(String.format("%.1f", prefs.reader.lineHeight)) })
            Section("About")
            ListItem(headlineContent = { Text("SoraReader Native") }, supportingContent = { Text("Kotlin + Jetpack Compose + Material 3 rebuild MVP") })
        }
    }
}

@Composable private fun Section(title: String) {
    Text(title, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
}
@Composable private fun Toggle(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    ListItem(headlineContent = { Text(title) }, supportingContent = { Text(subtitle) }, trailingContent = { Switch(checked = checked, onCheckedChange = onChange) })
}
