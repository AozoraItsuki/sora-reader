package app.sorareader.ui.navigation

import kotlinx.serialization.Serializable

@Serializable object LibraryRoute
@Serializable object UpdatesRoute
@Serializable object HistoryRoute
@Serializable object BrowseRoute
@Serializable object MoreRoute

@Serializable object SettingsRoute
@Serializable object RepositoriesRoute
@Serializable object DownloadsRoute
@Serializable object CategoriesRoute
@Serializable object AboutRoute
@Serializable object StatsRoute

@Serializable data class NovelRoute(val novelId: Long)
@Serializable data class ReaderRoute(val novelId: Long, val chapterId: Long)
