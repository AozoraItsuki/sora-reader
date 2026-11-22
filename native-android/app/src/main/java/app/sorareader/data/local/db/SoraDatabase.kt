package app.sorareader.data.local.db

import androidx.room.Database
import androidx.room.RoomDatabase
import app.sorareader.data.local.dao.CategoryDao
import app.sorareader.data.local.dao.ChapterDao
import app.sorareader.data.local.dao.HistoryDao
import app.sorareader.data.local.dao.NovelDao
import app.sorareader.data.local.dao.RepositoryDao
import app.sorareader.data.local.entity.CategoryEntity
import app.sorareader.data.local.entity.ChapterEntity
import app.sorareader.data.local.entity.NovelCategoryEntity
import app.sorareader.data.local.entity.NovelEntity
import app.sorareader.data.local.entity.ReadingHistoryEntity
import app.sorareader.data.local.entity.RepositoryEntity

@Database(
    entities = [
        NovelEntity::class, ChapterEntity::class, CategoryEntity::class,
        NovelCategoryEntity::class, RepositoryEntity::class, ReadingHistoryEntity::class,
    ],
    version = 2,
    // No Room schema JSON is committed in this repo, so exporting schemas would
    // only create untracked files (the KSP schemaLocation arg was removed too).
    // No migrations are declared: once the builder-level
    // fallbackToDestructiveMigration() call is removed, a version bump without a
    // migration will fail loudly instead of silently discarding user data.
    exportSchema = false,
)
abstract class SoraDatabase : RoomDatabase() {
    abstract fun novelDao(): NovelDao
    abstract fun chapterDao(): ChapterDao
    abstract fun categoryDao(): CategoryDao
    abstract fun repositoryDao(): RepositoryDao
    abstract fun historyDao(): HistoryDao
}
