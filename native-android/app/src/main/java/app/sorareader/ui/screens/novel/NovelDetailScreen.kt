package app.sorareader.ui.screens.novel

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.sorareader.ui.AppViewModelProvider

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NovelDetailScreen(novelId: Long, onBack: () -> Unit, onOpenChapter: (Long) -> Unit, vm: NovelDetailViewModel = viewModel(factory = AppViewModelProvider.Factory)) {
    LaunchedEffect(novelId) { vm.load(novelId) }
    val state by vm.state.collectAsStateWithLifecycle()
    val novel = state.novel
    Scaffold(topBar = {
        TopAppBar(
            title = { Text(novel?.title ?: "Novel", maxLines = 1) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            actions = {
                IconButton(onClick = { vm.refresh(novelId) }) { Icon(Icons.Default.Refresh, "Refresh") }
                IconButton(onClick = vm::downloadUnread) { Icon(Icons.Default.Download, "Download unread") }
                IconButton(onClick = vm::openCategories) { Icon(Icons.Default.Category, "Categories") }
                if (novel != null) IconButton(onClick = vm::toggleLibrary) { Icon(if (novel.inLibrary) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, "Library") }
            },
        )
    }) { inner ->
        LazyColumn(Modifier.fillMaxSize().padding(inner), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (state.loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            state.error?.let { msg -> item { Text(msg, color = MaterialTheme.colorScheme.error) } }
            if (novel != null) item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (novel.author.isNotBlank()) Text(novel.author, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (novel.description.isNotBlank()) Text(novel.description, style = MaterialTheme.typography.bodyMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AssistChip(onClick = {}, label = { Text(novel.status.name.lowercase().replace('_', ' ')) })
                        AssistChip(onClick = {}, label = { Text("${state.chapters.size} chapters") })
                    }
                }
            }
            items(state.chapters, key = { if (it.id != 0L) it.id else it.url.hashCode().toLong() }) { chapter ->
                Card(Modifier.fillMaxWidth().clickable { if (chapter.id != 0L) onOpenChapter(chapter.id) }) {
                    Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(chapter.title, style = MaterialTheme.typography.bodyLarge)
                            val status = when { chapter.isRead -> "Read"; chapter.readProgress > 0f -> "${(chapter.readProgress * 100).toInt()}%"; else -> "Unread" }
                            Text(status, style = MaterialTheme.typography.labelMedium, color = if (chapter.isRead) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
    if (state.showCategoryDialog) {
        CategoryPickerDialog(categories = state.categories, selected = state.selectedCategoryIds, onToggle = vm::toggleCategory, onDismiss = vm::dismissCategories, onConfirm = vm::saveCategories)
    }
}
