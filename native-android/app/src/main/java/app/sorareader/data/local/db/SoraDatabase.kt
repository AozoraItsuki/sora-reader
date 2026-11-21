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
    exportSchema = true,
)
abstract class SoraDatabase : RoomDatabase() {
    abstract fun novelDao(): NovelDao
    abstract fun chapterDao(): ChapterDao
    abstract fun categoryDao(): CategoryDao
    abstract fun repositoryDao(): RepositoryDao
    abstract fun historyDao(): HistoryDao
}
