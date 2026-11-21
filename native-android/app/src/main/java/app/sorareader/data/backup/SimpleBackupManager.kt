package app.sorareader.data.backup

import android.content.Context
import app.sorareader.domain.model.BackupOptions
import app.sorareader.domain.repository.NovelRepository
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

class SimpleBackupManager(private val context: Context, private val repo: NovelRepository, private val json: Json = Json { prettyPrint = true; ignoreUnknownKeys = true }) {
    @Serializable data class BackupPayload(val exportedAt: Long = System.currentTimeMillis(), val note: String = "MVP backup placeholder; full parity pending")
    suspend fun export(options: BackupOptions): File {
        val dir = File(context.getExternalFilesDir(null), "backups").also { it.mkdirs() }
        val file = File(dir, "sora-backup-${System.currentTimeMillis()}.json")
        file.writeText(json.encodeToString(BackupPayload()))
        return file
    }
}
