package app.sorareader.di

import android.content.Context
import androidx.room.Room
import app.sorareader.data.download.SimpleDownloadManager
import app.sorareader.data.local.db.SoraDatabase
import app.sorareader.data.repository.RepositoryStoreImpl
import app.sorareader.data.repository.RoomNovelRepository
import app.sorareader.data.settings.AppSettingsStore
import app.sorareader.data.source.RepositoryBackedSourceCatalog
import app.sorareader.data.source.SimpleSourceCatalog
import app.sorareader.domain.repository.DownloadManager
import app.sorareader.domain.repository.NovelRepository
import app.sorareader.domain.repository.RepositoryStore
import app.sorareader.domain.repository.SourceCatalog
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

class AppContainer(context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true }
    val httpClient = HttpClient(OkHttp) { install(ContentNegotiation) { json(json) } }

    val database: SoraDatabase = Room.databaseBuilder(
        context.applicationContext,
        SoraDatabase::class.java,
        "sora-reader.db",
    ).fallbackToDestructiveMigration().build()

    val novelRepository: NovelRepository = RoomNovelRepository(database)
    val sourceCatalog: SourceCatalog = RepositoryBackedSourceCatalog(repositoryStore, httpClient, json, SimpleSourceCatalog())
    val repositoryStore: RepositoryStore = RepositoryStoreImpl(database)
    val settings: AppSettingsStore = AppSettingsStore(context.applicationContext)
    val downloadManager: DownloadManager = SimpleDownloadManager(context.applicationContext).also { SimpleDownloadManager.instance = it }

    init {
        scope.launch { database.categoryDao().ensureDefault() }
    }
}
