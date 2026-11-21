package app.sorareader.ui.screens.downloads

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.sorareader.ui.AppViewModelProvider

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadsScreen(onBack: () -> Unit, vm: DownloadsViewModel = viewModel(factory = AppViewModelProvider.Factory)) {
    val queue by vm.queue.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        LargeTopAppBar(title = { Text("Downloads") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }, actions = {
            if (queue.isNotEmpty()) TextButton(onClick = vm::cancelAll) { Text("Cancel all") }
        })
    }) { inner ->
        LazyColumn(Modifier.fillMaxSize().padding(inner), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (queue.isEmpty()) item { Text("No download tasks.") }
            items(queue, key = { it.id }) { task ->
                ListItem(
                    headlineContent = { Text(task.chapterTitle) },
                    supportingContent = { Text("${task.novelTitle} • ${task.status}${task.error?.let { " - $it" } ?: ""}") },
                    trailingContent = { IconButton(onClick = { vm.cancel(task.id) }) { Icon(Icons.Default.Cancel, "Cancel") } },
                )
            }
        }
    }
}
