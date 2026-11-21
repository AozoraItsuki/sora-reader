package app.sorareader.data.download

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.sorareader.SoraReaderApp
import app.sorareader.domain.model.DownloadStatus

class DownloadChapterWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val taskId = inputData.getString("taskId") ?: return Result.failure()
        val chapterId = inputData.getLong("chapterId", -1L)
        val novelId = inputData.getLong("novelId", -1L)
        if (chapterId <= 0 || novelId <= 0) return Result.failure()
        val app = applicationContext as? SoraReaderApp ?: return Result.failure()
        val dm = SimpleDownloadManager.instance
        dm?.mark(taskId, DownloadStatus.RUNNING)
        return runCatching {
            val repo = app.container.novelRepository
            val chapter = repo.getChapterById(chapterId) ?: error("Chapter missing")
            val novel = repo.getNovelById(novelId) ?: error("Novel missing")
            val content = app.container.sourceCatalog.fetchChapterContent(novel.sourceId, chapter.url)
            val dir = java.io.File(applicationContext.filesDir, "downloads/$novelId").also { it.mkdirs() }
            val file = java.io.File(dir, "$chapterId.txt")
            file.writeText(content.paragraphs.joinToString("\n\n"))
            repo.markChapterDownloaded(chapterId, true, file.absolutePath)
            dm?.mark(taskId, DownloadStatus.COMPLETED)
            Result.success()
        }.getOrElse {
            dm?.mark(taskId, DownloadStatus.FAILED, it.message)
            Result.failure()
        }
    }
}
