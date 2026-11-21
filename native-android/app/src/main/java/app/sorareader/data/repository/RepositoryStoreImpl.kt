package app.sorareader.data.repository

import app.sorareader.data.local.db.SoraDatabase
import app.sorareader.data.local.entity.RepositoryEntity
import app.sorareader.data.local.entity.toDomain
import app.sorareader.domain.model.Repository
import app.sorareader.domain.repository.RepositoryStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class RepositoryStoreImpl(db: SoraDatabase) : RepositoryStore {
    private val dao = db.repositoryDao()
    override fun observeRepositories(): Flow<List<Repository>> = dao.observeAll().map { it.map { e -> e.toDomain() } }
    override suspend fun addRepository(url: String) { dao.insert(RepositoryEntity(url = url.trim())) }
    override suspend fun updateRepository(repo: Repository) { dao.update(RepositoryEntity(id = repo.id, url = repo.url, enabled = repo.enabled)) }
    override suspend fun deleteRepository(id: Long) { dao.delete(id) }
}
