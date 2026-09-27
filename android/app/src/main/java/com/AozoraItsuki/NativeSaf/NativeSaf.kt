package com.AozoraItsuki.NativeSaf

import android.content.Intent
import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.modules.network.CookieJarContainer
import com.facebook.react.modules.network.ForwardingCookieHandler
import com.facebook.react.modules.network.OkHttpClientProvider
import com.sorareader.spec.NativeSafSpec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.Headers
import okhttp3.JavaNetCookieJar
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.io.InputStream
import java.io.PushbackInputStream
import java.nio.charset.StandardCharsets
import java.util.zip.GZIPInputStream

/**
 * TurboModule backing the user-picked Storage Access Framework download tree.
 *
 * All paths arrive RELATIVE to the tree root (`Novels/{plugin}/{novel}/...`)
 * and are resolved by [SafTree] through `DocumentFile`; the tree itself is
 * only ever addressed by document uri. Every method hops to the IO dispatcher
 * so a slow provider never blocks the JS thread.
 */
class NativeSaf(context: ReactApplicationContext) : NativeSafSpec(context) {
    private val bufferSize = 8192
    private val okHttpClient = OkHttpClientProvider.createClient()
    private val ioScope = CoroutineScope(Dispatchers.IO)

    init {
        val cookieContainer = okHttpClient.cookieJar as CookieJarContainer
        val cookieHandler = ForwardingCookieHandler(reactApplicationContext)
        cookieContainer.setCookieJar(JavaNetCookieJar(cookieHandler))
    }

    override fun takePersistablePermission(
        treeUri: String,
        readWrite: Boolean,
        promise: Promise,
    ) {
        ioScope.launch {
            try {
                val uri = Uri.parse(treeUri)
                val flags = if (readWrite) readWriteFlags() else Intent.FLAG_GRANT_READ_URI_PERMISSION
                reactApplicationContext.contentResolver
                    .takePersistableUriPermission(uri, flags)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SAF_PERMISSION_DENIED", e.message, e)
            }
        }
    }

    override fun releaseTreeUri(treeUri: String, promise: Promise) {
        ioScope.launch {
            val released = runCatching {
                reactApplicationContext.contentResolver
                    .releasePersistableUriPermission(Uri.parse(treeUri), readWriteFlags())
            }.isSuccess
            promise.resolve(released)
        }
    }

    override fun hasTreeAccess(treeUri: String, promise: Promise) {
        withTree(treeUri, promise) { it.isAccessible() }
    }

    override fun mkdir(treeUri: String, relPath: String, promise: Promise) {
        withTree(treeUri, promise) {
            it.createDirectories(relPath)
            true
        }
    }

    override fun exists(treeUri: String, relPath: String, promise: Promise) {
        withTree(treeUri, promise) { it.exists(relPath) }
    }

    override fun isDirectory(treeUri: String, relPath: String, promise: Promise) {
        withTree(treeUri, promise) { it.isDirectory(relPath) }
    }

    override fun writeFile(
        treeUri: String,
        relPath: String,
        data: String,
        encoding: String,
        promise: Promise,
    ) {
        withTree(treeUri, promise) { tree ->
            val bytes = if (isBase64(encoding)) {
                Base64.decode(data, Base64.DEFAULT)
            } else {
                data.toByteArray(StandardCharsets.UTF_8)
            }
            tree.writeBytes(relPath, bytes, SafMime.fromPayload(bytes, bytes.size, relPath))
            true
        }
    }

    override fun readFile(
        treeUri: String,
        relPath: String,
        encoding: String,
        promise: Promise,
    ) {
        withTree(treeUri, promise) { tree ->
            val bytes = tree.readBytes(relPath)
            if (isBase64(encoding)) {
                Base64.encodeToString(bytes, Base64.NO_WRAP)
            } else {
                String(bytes, StandardCharsets.UTF_8)
            }
        }
    }

    override fun unlink(treeUri: String, relPath: String, promise: Promise) {
        withTree(treeUri, promise) { it.delete(relPath) }
    }

    override fun readDir(treeUri: String, relPath: String, promise: Promise) {
        withTree(treeUri, promise) { tree ->
            val names: WritableNativeArray = WritableNativeArray()
            tree.childNames(relPath).forEach(names::pushString)
            names
        }
    }

    override fun move(
        treeUri: String,
        fromRelPath: String,
        toRelPath: String,
        promise: Promise,
    ) {
        withTree(treeUri, promise) { tree ->
            tree.move(fromRelPath, toRelPath)
            true
        }
    }

    override fun getFileSize(treeUri: String, relPath: String, promise: Promise) {
        withTree(treeUri, promise) { it.sizeOf(relPath).toDouble() }
    }

    override fun downloadFile(
        treeUri: String,
        url: String,
        relPath: String,
        method: String,
        headers: ReadableMap,
        body: String?,
        promise: Promise,
    ) {
        ioScope.launch {
            try {
                val tree = SafTree(reactApplicationContext, Uri.parse(treeUri))
                val request = Request.Builder()
                    .url(url)
                    .headers(headers.toOkHttpHeaders())
                    .apply {
                        if (method.lowercase() == "get") {
                            get()
                        } else if (body != null) {
                            post(body.toRequestBody())
                        }
                    }
                    .build()
                okHttpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        throw IOException("Download failed with ${response.code}: $url")
                    }
                    val payload = response.body?.byteStream()
                        ?: throw IOException("Empty response body: $url")
                    val pushback = PushbackInputStream(decompressStream(payload), SafMime.SNIFF_BYTES)
                    val (head, headLength) = SafMime.sniff(pushback)
                    val mimeType = SafMime.fromPayload(head, headLength, relPath)
                    tree.writeStream(relPath, mimeType) { output ->
                        pushback.copyTo(output, bufferSize)
                    }
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SAF_DOWNLOAD_FAILED", e.message, e)
            }
        }
    }

    /** Open the tree and run [block] on the IO dispatcher, rejecting on error. */
    private fun <T> withTree(treeUri: String, promise: Promise, block: (SafTree) -> T) {
        ioScope.launch {
            try {
                val tree = SafTree(reactApplicationContext, Uri.parse(treeUri))
                promise.resolve(block(tree))
            } catch (e: Exception) {
                promise.reject("SAF_ERROR", e.message, e)
            }
        }
    }

    private fun ReadableMap.toOkHttpHeaders(): Headers = Headers.Builder().also { builder ->
        entryIterator.forEach { entry -> builder.add(entry.key, entry.value.toString()) }
    }.build()

    private fun readWriteFlags(): Int =
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION

    private fun isBase64(encoding: String): Boolean =
        encoding.equals("base64", ignoreCase = true)

    private fun decompressStream(input: InputStream): InputStream {
        val pushback = PushbackInputStream(input, 2)
        val signature = ByteArray(2)
        val length = pushback.read(signature)
        if (length == -1) return pushback
        pushback.unread(signature, 0, length)
        return if (signature[0] == 0x1f.toByte() && signature[1] == 0x8b.toByte()) {
            GZIPInputStream(pushback)
        } else {
            pushback
        }
    }
}
