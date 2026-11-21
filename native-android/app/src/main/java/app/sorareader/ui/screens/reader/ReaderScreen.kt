package app.sorareader.ui.screens.reader

import android.annotation.SuppressLint
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.sorareader.ui.AppViewModelProvider

@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ReaderScreen(novelId: Long, chapterId: Long, onBack: () -> Unit, vm: ReaderViewModel = viewModel(factory = AppViewModelProvider.Factory)) {
    LaunchedEffect(novelId, chapterId) { vm.load(novelId, chapterId) }
    val state by vm.state.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(
            title = { Text(state.chapter?.title ?: "Reader", maxLines = 1) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
        )
    }) { inner ->
        Column(Modifier.fillMaxSize().padding(inner)) {
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp)) }
            val content = state.content
            if (content != null) {
                val html = buildReaderHtml(content.title, content.paragraphs, content.html, state.fontSize, state.lineHeight)
                AndroidView(
                    factory = { ctx -> WebView(ctx).apply { settings.javaScriptEnabled = false; webViewClient = WebViewClient() } },
                    update = { it.loadDataWithBaseURL(null, html, "text/html", "utf-8", null) },
                    modifier = Modifier.fillMaxSize(),
                )
                LaunchedEffect(content.chapterId) { vm.onProgress(1f) }
            }
        }
    }
}

private fun buildReaderHtml(title: String, paragraphs: List<String>, rawHtml: String?, fontSize: Float, lineHeight: Float): String {
    val body = rawHtml ?: paragraphs.joinToString("") { "<p>${it.replace("<", "&lt;").replace(">", "&gt;")}</p>" }
    return """
    <html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'/>
    <style>
      body{margin:0;padding:16px;font-size:${fontSize}px;line-height:$lineHeight;background:#121212;color:#e6e6e6;font-family:sans-serif;}
      h1{font-size:${(fontSize * 1.4).toInt()}px;line-height:1.3;} p{margin:0 0 1em 0;} img{max-width:100%;height:auto;}
    </style></head><body><h1>${title.replace("<", "&lt;")}</h1>$body</body></html>
    """.trimIndent()
}
