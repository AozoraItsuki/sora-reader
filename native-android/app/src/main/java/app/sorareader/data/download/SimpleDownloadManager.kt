package app.sorareader.data.download

import android.content.Context
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import app.sorareader.domain.model.Chapter
import app.sorareader.domain.model.DownloadStatus
import app.sorareader.domain.model.DownloadTask
import app.sorareader.domain.model.Novel
import app.sorareader.domain.repository.DownloadManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID

class SimpleDownloadManager(private val context: Context) : DownloadManager {
    private val tasks = MutableStateFlow<List<DownloadTask>>(emptyList())
    override fun observeQueue(): Flow<List<DownloadTask>> = tasks.asStateFlow()
    override suspend fun enqueue(novel: Novel, chapters: List<Chapter>) {
        val wm = WorkManager.getInstance(context)
        chapters.forEach { chapter ->
            val id = UUID.randomUUID().toString()
            tasks.update { it + DownloadTask(id = id, chapterId = chapter.id, novelId = novel.id, novelTitle = novel.title, chapterTitle = chapter.title, status = DownloadStatus.QUEUED) }
            val req = OneTimeWorkRequestBuilder<DownloadChapterWorker>()
                .setInputData(Data.Builder().putLong("chapterId", chapter.id).putLong("novelId", novel.id).putString("taskId", id).build())
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            wm.enqueueUniqueWork("download-${chapter.id}", ExistingWorkPolicy.KEEP, req)
        }
    }
    override suspend fun cancel(taskId: String) { tasks.update { list -> list.map { if (it.id == taskId) it.copy(status = DownloadStatus.CANCELLED) else it } } }
    override suspend fun cancelAll() { WorkManager.getInstance(context).cancelAllWorkByTag("chapter-download"); tasks.update { list -> list.map { if (it.status == DownloadStatus.QUEUED || it.status == DownloadStatus.RUNNING) it.copy(status = DownloadStatus.CANCELLED) else it } } }
    internal fun mark(taskId: String, status: DownloadStatus, error: String? = null) { tasks.update { list -> list.map { if (it.id == taskId) it.copy(status = status, error = error, progress = if (status == DownloadStatus.COMPLETED) 1f else it.progress) else it } } }
    companion object { @Volatile var instance: SimpleDownloadManager? = null }
}
