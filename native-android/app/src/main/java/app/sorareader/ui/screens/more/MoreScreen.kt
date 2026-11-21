package app.sorareader.ui.screens.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoreScreen(onOpenSettings: () -> Unit, onOpenRepositories: () -> Unit, onOpenDownloads: () -> Unit, onOpenCategories: () -> Unit, onOpenAbout: () -> Unit, onOpenStats: () -> Unit) {
    Scaffold(topBar = { LargeTopAppBar(title = { Text("More") }) }) { inner ->
        Column(Modifier.fillMaxSize().padding(inner)) {
            ListItem(headlineContent = { Text("Settings") }, supportingContent = { Text("Appearance, reader, downloads, backup") }, leadingContent = { Icon(Icons.Default.Settings, null) }, modifier = Modifier.clickable(onClick = onOpenSettings))
            ListItem(headlineContent = { Text("Repositories") }, supportingContent = { Text("Manage simple JSON source repositories") }, leadingContent = { Icon(Icons.Default.Extension, null) }, modifier = Modifier.clickable(onClick = onOpenRepositories))
            ListItem(headlineContent = { Text("Downloads") }, supportingContent = { Text("Download queue (WorkManager MVP)") }, leadingContent = { Icon(Icons.Default.Download, null) }, modifier = Modifier.clickable(onClick = onOpenDownloads))
            ListItem(headlineContent = { Text("Categories") }, supportingContent = { Text("Manage library categories") }, leadingContent = { Icon(Icons.Default.Category, null) }, modifier = Modifier.clickable(onClick = onOpenCategories))
            ListItem(headlineContent = { Text("Statistics") }, supportingContent = { Text("Library and reading stats") }, leadingContent = { Icon(Icons.Default.BarChart, null) }, modifier = Modifier.clickable(onClick = onOpenStats))
            ListItem(headlineContent = { Text("About") }, supportingContent = { Text("SoraReader Native - Kotlin/Compose Material 3 rebuild (in progress)") }, leadingContent = { Icon(Icons.Default.Info, null) }, modifier = Modifier.clickable(onClick = onOpenAbout))
        }
    }
}
