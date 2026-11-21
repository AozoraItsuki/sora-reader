package app.sorareader.ui.screens.browse

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
fun BrowseScreen(onOpenNovel: (Long) -> Unit, vm: BrowseViewModel = viewModel(factory = AppViewModelProvider.Factory)) {
    val state by vm.state.collectAsStateWithLifecycle()
    Scaffold(topBar = { LargeTopAppBar(title = { Text("Browse") }) }) { inner ->
        Column(Modifier.fillMaxSize().padding(inner).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                state.sources.forEach { src ->
                    FilterChip(selected = state.selectedSourceId == src.id, onClick = { vm.onSourceSelect(src.id) }, label = { Text(src.name) })
                }
            }
            OutlinedTextField(value = state.query, onValueChange = vm::onQueryChange, modifier = Modifier.fillMaxWidth(), label = { Text("Search novels") }, singleLine = true)
            Button(onClick = vm::search, enabled = !state.loading) { Text("Search") }
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            LazyColumn(contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(state.results, key = { it.sourceId + it.url }) { novel ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(novel.title, style = MaterialTheme.typography.titleMedium)
                            if (novel.description.isNotBlank()) Text(novel.description, style = MaterialTheme.typography.bodyMedium, maxLines = 3)
                            Button(onClick = { vm.addToLibrary(novel, onOpenNovel) }) { Text("Add to library") }
                        }
                    }
                }
            }
        }
    }
}
