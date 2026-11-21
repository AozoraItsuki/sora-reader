package app.sorareader.ui.screens.novel

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.sorareader.domain.model.Category

@Composable
fun CategoryPickerDialog(
    categories: List<Category>,
    selected: Set<Long>,
    onToggle: (Long) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Set categories") },
        text = {
            LazyColumn {
                items(categories, key = { it.id }) { cat ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = cat.id in selected, onCheckedChange = { onToggle(cat.id) })
                        Column(Modifier.padding(start = 8.dp)) { Text(cat.name) }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onConfirm) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
