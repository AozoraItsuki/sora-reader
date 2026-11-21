package app.sorareader.ui

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.sorareader.SoraReaderApp
import app.sorareader.ui.screens.browse.BrowseViewModel
import app.sorareader.ui.screens.categories.CategoriesViewModel
import app.sorareader.ui.screens.downloads.DownloadsViewModel
import app.sorareader.ui.screens.history.HistoryViewModel
import app.sorareader.ui.screens.library.LibraryViewModel
import app.sorareader.ui.screens.novel.NovelDetailViewModel
import app.sorareader.ui.screens.reader.ReaderViewModel
import app.sorareader.ui.screens.settings.RepositoriesViewModel
import app.sorareader.ui.screens.settings.SettingsViewModel
import app.sorareader.ui.screens.stats.StatsViewModel
import app.sorareader.ui.screens.updates.UpdatesViewModel

object AppViewModelProvider {
    val Factory = viewModelFactory {
        initializer { LibraryViewModel(app().container.novelRepository) }
        initializer { BrowseViewModel(app().container.novelRepository, app().container.sourceCatalog) }
        initializer { NovelDetailViewModel(app().container.novelRepository, app().container.sourceCatalog, app().container.downloadManager) }
        initializer { ReaderViewModel(app().container.novelRepository, app().container.sourceCatalog, app().applicationContext) }
        initializer { HistoryViewModel(app().container.novelRepository) }
        initializer { UpdatesViewModel(app().container.novelRepository) }
        initializer { SettingsViewModel(app().container.settings) }
        initializer { RepositoriesViewModel(app().container.repositoryStore) }
        initializer { DownloadsViewModel(app().container.downloadManager) }
        initializer { CategoriesViewModel(app().container.novelRepository) }
        initializer { StatsViewModel(app().container.novelRepository) }
    }
}

fun CreationExtras.app(): SoraReaderApp =
    (this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as SoraReaderApp)
