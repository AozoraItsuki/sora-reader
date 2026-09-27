package com.AozoraItsuki.NativeSaf

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import java.io.InputStream
import java.io.OutputStream

internal class SafException(message: String, cause: Throwable? = null) :
    Exception(message, cause)

/**
 * Navigation and IO for one user-picked SAF tree.
 *
 * Relative paths are resolved segment by segment through
 * [DocumentFile.fromTreeUri]; parent directories are created on demand. The
 * tree is addressed exclusively by document uri, so no `java.io.File` ever
 * touches it.
 */
internal class SafTree(context: Context, val treeUri: Uri) {
    private val resolver = context.contentResolver
    private val root: DocumentFile =
        DocumentFile.fromTreeUri(context, treeUri)
            ?: throw SafException("Not a document tree uri: $treeUri")

    init {
        if (!root.isDirectory) {
            throw SafException("Tree root is not a directory: $treeUri")
        }
    }

    /** Resolve `relPath` without creating anything; null when it is missing. */
    fun find(relPath: String): DocumentFile? =
        resolve(segments(relPath), create = false, fileMimeType = null)

    fun exists(relPath: String): Boolean = find(relPath) != null

    /** True while the tree can still be both read and written by this app. */
    fun isAccessible(): Boolean = root.canRead() && root.canWrite()

    fun isDirectory(relPath: String): Boolean = find(relPath)?.isDirectory == true

    /** Create `relPath` and every missing parent directory. */
    fun createDirectories(relPath: String) {
        resolve(segments(relPath), create = true, fileMimeType = null)
            ?: throw SafException("Could not create directory: $relPath")
    }

    /** Display names of the direct children, empty when the path is missing. */
    fun childNames(relPath: String): List<String> =
        find(relPath)?.listFiles().orEmpty().mapNotNull { it.name }

    /** Recursive size in bytes; 0 when the path is missing. */
    fun sizeOf(relPath: String): Long = when (val document = find(relPath)) {
        null -> 0L
        else -> if (document.isDirectory) 0L else document.length()
    }

    fun readBytes(relPath: String): ByteArray {
        val document = find(relPath) ?: throw SafException("Not found: $relPath")
        return (resolver.openInputStream(document.uri) ?: throw SafException("Not found: $relPath")).use { it.readBytes() }
    }

    fun writeBytes(relPath: String, bytes: ByteArray, mimeType: String) {
        writeStream(relPath, mimeType) { it.write(bytes) }
    }

    /** Truncate `relPath` (creating parents) and hand the stream to `writer`. */
    fun writeStream(relPath: String, mimeType: String, writer: (OutputStream) -> Unit) {
        val parts = segments(relPath)
        val name = parts.lastOrNull() ?: throw SafException("Missing file name: $relPath")
        val document = resolve(parts, create = true, fileMimeType = mimeType, fileName = name)
            ?: throw SafException("Could not create file: $relPath")
        openOutput(document).use(writer)
    }

    /** Recursively remove a file or directory; false when already absent. */
    fun delete(relPath: String): Boolean {
        val document = find(relPath) ?: return false
        return deleteDocument(document)
    }

    /**
     * Move a file or directory. Renames in place when the provider supports it,
     * otherwise copies the subtree and removes the source.
     */
    fun move(fromRelPath: String, toRelPath: String) {
        val source = find(fromRelPath) ?: throw SafException("Not found: $fromRelPath")
        val parts = segments(toRelPath)
        val name = parts.lastOrNull() ?: throw SafException("Missing file name: $toRelPath")
        val parent = resolve(parts.dropLast(1), create = true, fileMimeType = null)
            ?: throw SafException("Could not create directory for: $toRelPath")
        val target = parent.findFile(name)
        if (target != null && !deleteDocument(target)) {
            throw SafException("Could not replace: $toRelPath")
        }
        if (parentIdOf(source) == parentIdOf(parent) && source.renameTo(name)) {
            return
        }
        copyInto(source, parent, name)
        if (!deleteDocument(source)) {
            throw SafException("Could not remove source: $fromRelPath")
        }
    }

    private fun openOutput(document: DocumentFile): OutputStream =
        resolver.openOutputStream(document.uri, "wt")
            ?: throw SafException("Could not open output stream: ${document.uri}")

    private fun resolve(
        parts: List<String>,
        create: Boolean,
        fileMimeType: String?,
        fileName: String? = null,
    ): DocumentFile? {
        var current = root
        parts.forEachIndexed { index, segment ->
            // A trailing segment with a MIME type is the file itself, every
            // earlier one is a directory.
            val mimeType = fileMimeType?.takeIf { index == parts.lastIndex }
            val existing = current.findFile(segment)
            if (existing != null) {
                if (existing.isDirectory == (mimeType == null)) {
                    current = existing
                    return@forEachIndexed
                }
                // A file sits where a directory is needed (or the other way
                // round): only a creating call may repair that.
                if (!create || !deleteDocument(existing)) return null
            } else if (!create) {
                return null
            }
            current = if (mimeType != null) {
                current.createFile(mimeType, fileName ?: segment)
            } else {
                current.createDirectory(segment)
            } ?: throw SafException("Could not create: $segment")
        }
        return current
    }

    private fun copyInto(source: DocumentFile, targetParent: DocumentFile, name: String) {
        if (source.isDirectory) {
            val directory = targetParent.createDirectory(name)
                ?: throw SafException("Could not create directory: $name")
            source.listFiles().orEmpty().forEach { child ->
                copyInto(child, directory, child.name ?: throw SafException("Unnamed entry"))
            }
            return
        }
        val mimeType = source.type ?: SafMime.OCTET_STREAM
        val target = targetParent.createFile(mimeType, name)
            ?: throw SafException("Could not create file: $name")
        val input: InputStream = resolver.openInputStream(source.uri)
            ?: throw SafException("Could not read: ${source.uri}")
        input.use { openOutput(target).use { output -> it.copyTo(output) } }
    }

    private fun deleteDocument(document: DocumentFile): Boolean =
        if (document.isDirectory) {
            document.listFiles().orEmpty().forEach { deleteDocument(it) }
            document.delete()
        } else {
            document.delete()
        }

    /** Document id of the parent, or "" when it cannot be determined. */
    private fun parentIdOf(document: DocumentFile): String = runCatching {
        DocumentsContract.getDocumentId(document.uri).substringBeforeLast('/', "")
    }.getOrDefault("")

    private fun segments(relPath: String): List<String> {
        val parts = relPath.split('/').filter { it.isNotEmpty() }
        if (parts.any { it == "." || it == ".." }) {
            throw SafException("Unsafe relative path: $relPath")
        }
        return parts
    }
}
