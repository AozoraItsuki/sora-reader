package com.AozoraItsuki.NativeSaf

import android.webkit.MimeTypeMap
import java.io.ByteArrayOutputStream
import java.io.PushbackInputStream

/**
 * MIME type detection for files created inside a SAF tree.
 *
 * The payload is sniffed first (same magic-byte approach as
 * `NativeFile.detectImageMimeType`) so a WebP served under a `.png` name is
 * still stored with a truthful MIME type; the file name is the fallback.
 */
internal object SafMime {
    const val OCTET_STREAM = "application/octet-stream"

    /** Bytes read from the payload before the file is created. */
    const val SNIFF_BYTES = 16

    private val EXTENSION_TYPES = mapOf(
        "html" to "text/html",
        "htm" to "text/html",
        "json" to "application/json",
        "css" to "text/css",
        "js" to "text/javascript",
        "txt" to "text/plain",
        "xml" to "text/xml",
        "nomedia" to OCTET_STREAM,
    )

    /**
     * @param head first [SNIFF_BYTES] of the payload
     * @param length how many of them are valid
     */
    fun fromPayload(head: ByteArray, length: Int, fileName: String): String {
        val sniffed = when {
            length < 4 -> null
            head.startsWith(0x89, 0x50, 0x4E, 0x47) -> "image/png"
            head.startsWith(0xFF, 0xD8, 0xFF) -> "image/jpeg"
            head.startsWith(0x47, 0x49, 0x46, 0x38) -> "image/gif"
            head.startsWith(0x52, 0x49, 0x46, 0x46) &&
                head.startsWith(0x57, 0x45, 0x42, 0x50, offset = 8) -> "image/webp"
            head.startsWith(0x42, 0x4D) -> "image/bmp"
            head.startsWith(0x66, 0x74, 0x79, 0x70, offset = 4) -> when {
                head.startsWith(0x61, 0x76, 0x69, 0x66, offset = 8) -> "image/avif"
                head.startsWith(0x61, 0x76, 0x69, 0x73, offset = 8) -> "image/avif"
                head.startsWith(0x68, 0x65, 0x69, 0x66, offset = 8) -> "image/heic"
                head.startsWith(0x68, 0x65, 0x69, 0x78, offset = 8) -> "image/heic"
                head.startsWith(0x68, 0x65, 0x69, 0x6D, offset = 8) -> "image/heic"
                head.startsWith(0x6D, 0x69, 0x66, 0x31, offset = 8) -> "image/heif"
                head.startsWith(0x68, 0x65, 0x69, 0x66, offset = 8) -> "image/heif"
                else -> null
            }
            head.startsWith(0x3C) -> "text/html"
            else -> null
        }
        return sniffed ?: fromName(fileName)
    }

    /** Extension-based guess, used when the payload is not recognisable. */
    fun fromName(fileName: String): String {
        val name = fileName.substringAfterLast('/')
        // Compound extensions the downloader relies on: `3.b64.png` is a png.
        val extension = name.substringAfterLast('.', "").lowercase()
        if (extension.isEmpty()) return OCTET_STREAM
        return EXTENSION_TYPES[extension]
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
            ?: OCTET_STREAM
    }

    /**
     * Peek at the first [SNIFF_BYTES] bytes without consuming them: the
     * [PushbackInputStream] still yields the full payload afterwards.
     */
    fun sniff(input: PushbackInputStream): Pair<ByteArray, Int> {
        val buffer = ByteArray(SNIFF_BYTES)
        val collected = ByteArrayOutputStream(SNIFF_BYTES)
        while (collected.size() < SNIFF_BYTES) {
            val read = input.read(buffer, 0, SNIFF_BYTES - collected.size())
            if (read <= 0) break
            collected.write(buffer, 0, read)
        }
        val head = collected.toByteArray()
        if (head.isNotEmpty()) input.unread(head)
        return head to head.size
    }
}

private fun ByteArray.startsWith(vararg expected: Int, offset: Int = 0): Boolean {
    if (offset + expected.size > size) return false
    return expected.indices.all { this[offset + it] == expected[it].toByte() }
}
