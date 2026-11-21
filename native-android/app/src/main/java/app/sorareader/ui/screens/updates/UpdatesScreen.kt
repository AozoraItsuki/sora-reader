package app.sorareader.ui.screens.updates

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.sorareader.ui.AppViewModelProvider
import java.text.DateFormat
import java.util.Date

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdatesScreen(onOpenNovel: (Long) -> Unit, vm: UpdatesViewModel = viewModel(factory = AppViewModelProvider.Factory)) {
    val updates by vm.updates.collectAsStateWithLifecycle()
    Scaffold(topBar = { LargeTopAppBar(title = { Text("Updates") }) }) { inner ->
        if (updates.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(inner).padding(24.dp), verticalArrangement = Arrangement.Center) {
                Text("No updates yet", style = MaterialTheme.typography.headlineSmall)
                Text("Novels in your library will appear here when updated.", style = MaterialTheme.typography.bodyMedium)
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(inner), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(updates, key = { it.id }) { novel ->
                    Card(Modifier.fillMaxWidth().clickable { onOpenNovel(novel.id) }) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(novel.title, style = MaterialTheme.typography.titleMedium)
                            novel.lastUpdatedAt?.let { Text(DateFormat.getDateTimeInstance().format(Date(it)), style = MaterialTheme.typography.labelSmall) }
                            Text("${novel.chaptersUnread} unread chapters", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}
