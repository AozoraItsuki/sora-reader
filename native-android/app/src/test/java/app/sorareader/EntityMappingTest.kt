package app.sorareader

import app.sorareader.data.local.entity.toDomain
import app.sorareader.data.local.entity.toEntity
import app.sorareader.domain.model.Novel
import app.sorareader.domain.model.NovelStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class EntityMappingTest {
    @Test
    fun novelRoundTrip_preservesFields() {
        val novel = Novel(
            id = 1L,
            sourceId = "demo",
            url = "demo://novel/1",
            title = "Test",
            author = "Author",
            description = "Desc",
            status = NovelStatus.ONGOING,
            genres = listOf("A", "B"),
            inLibrary = true,
        )
        val back = novel.toEntity().toDomain()
        assertEquals(novel, back)
    }
}
