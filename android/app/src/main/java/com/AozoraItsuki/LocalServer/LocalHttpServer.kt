package com.AozoraItsuki.LocalServer

import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.MimeTypeMap
import androidx.documentfile.provider.DocumentFile
import fi.iki.elonen.NanoHTTPD
import java.io.File
import java.io.FileInputStream
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
import java.io.FilterInputStream

/**
 * A lightweight HTTP server that serves the downloads tree.
 *
 * When [safSourceProvider] yields a user-picked SAF tree, requests are resolved
 * by traversing that tree; otherwise the legacy app-private `NOVEL_STORAGE`
 * directory is served. Both backends expose the same URLs, so nothing above
 * this class has to care where the files physically live.
 */
class LocalHttpServer(
    port: Int,
    private val basePath: String,
    private val safSourceProvider: () -> SafSource? = { null },
) : NanoHTTPD("127.0.0.1", port) {
    companion object {
        private const val TAG = "LocalHttpServer"
        private const val NOVELS_DIR = "Novels"
        private val EMPTY_BYTE_ARRAY = ByteArray(0)
    }

    /** A user-picked Storage Access Framework tree to serve from. */
    class SafSource(val context: Context, val treeUri: Uri)

    var allowProxyAPI: Boolean = false

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri ?: return newFixedLengthResponse(
            Response.Status.BAD_REQUEST, "text/plain", "Bad request"
        )

        if (session.method == Method.OPTIONS) {
            val response = newFixedLengthResponse(Response.Status.OK, "text/plain", "")
            val origin = session.headers["origin"] ?: "*"
            response.addHeader("Access-Control-Allow-Origin", origin)
            response.addHeader("Access-Control-Allow-Credentials", "true")
            response.addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
            response.addHeader("Access-Control-Allow-Headers", session.headers["access-control-request-headers"] ?: "*")
            return response
        }

        if (uri.startsWith("/proxy")) {
            if (!allowProxyAPI) {
                val errRes = newFixedLengthResponse(Response.Status.FORBIDDEN, "text/plain", "Proxy API is disabled in settings")
                val origin = session.headers["origin"] ?: "*"
                errRes.addHeader("Access-Control-Allow-Origin", origin)
                errRes.addHeader("Access-Control-Allow-Credentials", "true")
                return errRes
            }
            return handleProxyRequest(session)
        }

        // Decode URI and split it into path segments. Decoding first means an
        // encoded `..` cannot sneak past the segment check below.
        val requestedPath = Uri.decode(uri).trimStart('/')
        if (requestedPath.isEmpty()) {
            return newFixedLengthResponse(
                Response.Status.NOT_FOUND, "text/plain", "Not found"
            )
        }

        // Reject traversal before either backend is touched. The disk backend
        // additionally re-verifies with a canonical-path check.
        val segments = requestedPath.split('/')
        if (segments.any { it.isEmpty() || it == "." || it == ".." }) {
            Log.w(TAG, "Path traversal attempt blocked: $uri")
            return newFixedLengthResponse(
                Response.Status.FORBIDDEN, "text/plain", "Access denied"
            )
        }

        val safSource = safSourceProvider()
        if (safSource != null) {
            return serveFromSaf(safSource, segments, requestedPath)
        }

        return serveFromDisk(requestedPath)
    }

    private fun notFound(requestedPath: String): Response =
        newFixedLengthResponse(
            Response.Status.NOT_FOUND, "text/plain", "File not found: $requestedPath"
        )

    /**
     * Resolve `segments` inside the picked tree and stream the bytes back.
     *
     * Both `/<plugin>/<novel>/<chapter>/index.html` and
     * `/Novels/<plugin>/<novel>/<chapter>/index.html` are accepted, so URLs
     * built with and without the `Novels` prefix keep working.
     */
    private fun serveFromSaf(
        source: SafSource,
        segments: List<String>,
        requestedPath: String,
    ): Response {
        val tree = DocumentFile.fromTreeUri(source.context, source.treeUri)
        if (tree == null || !tree.isDirectory) {
            Log.w(TAG, "SAF tree unavailable: ${source.treeUri}")
            return notFound(requestedPath)
        }

        val relative = if (segments.first() == NOVELS_DIR) segments.drop(1) else segments
        if (relative.isEmpty()) {
            return notFound(requestedPath)
        }

        var dir: DocumentFile = tree
        if (relative.first() != NOVELS_DIR) {
            val novels = tree.findFile(NOVELS_DIR)
            if (novels == null || !novels.isDirectory) {
                return notFound(requestedPath)
            }
            dir = novels
        }

        for (segment in relative.drop(1)) {
            val child = dir.findFile(segment)
            if (child == null || !child.isDirectory) {
                return notFound(requestedPath)
            }
            dir = child
        }

        val file = dir.findFile(relative.last())
        if (file == null || !file.isFile) {
            return notFound(requestedPath)
        }

        val mimeType = getMimeType(file.name ?: relative.last())
        val fileLength = file.length()

        return try {
            val input = source.context.contentResolver.openInputStream(file.uri)
                ?: return notFound(requestedPath)
            newFixedLengthResponse(Response.Status.OK, mimeType, input, fileLength)
        } catch (e: Exception) {
            Log.e(TAG, "Error serving SAF file: ${file.uri}", e)
            newFixedLengthResponse(
                Response.Status.INTERNAL_ERROR, "text/plain", "Internal server error"
            )
        }
    }

    private fun serveFromDisk(requestedPath: String): Response {
        val file = File(basePath, requestedPath)

        // Canonicalize and verify path stays within basePath
        val canonicalBase = File(basePath).canonicalPath
        val canonicalFile = file.canonicalPath
        if (!canonicalFile.startsWith(canonicalBase)) {
            Log.w(TAG, "Path traversal attempt blocked: $requestedPath")
            return newFixedLengthResponse(
                Response.Status.FORBIDDEN, "text/plain", "Access denied"
            )
        }

        if (!file.exists() || !file.isFile) {
            return notFound(requestedPath)
        }

        // Detect MIME type
        val mimeType = getMimeType(file.name)
        val fileLength = file.length()

        return try {
            val fis = FileInputStream(file)
            val response = newFixedLengthResponse(Response.Status.OK, mimeType, fis, fileLength)
            // Add CORS and cache headers
            // response.addHeader("Access-Control-Allow-Origin", "*")
            // response.addHeader("Cache-Control", "public, max-age=3600")
            response
        } catch (e: Exception) {
            Log.e(TAG, "Error serving file: $canonicalFile", e)
            newFixedLengthResponse(
                Response.Status.INTERNAL_ERROR, "text/plain", "Internal server error"
            )
        }
    }

    private fun handleProxyRequest(session: IHTTPSession): Response {
        val targetUrl = session.parameters["url"]?.firstOrNull()
            ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Missing url parameter").apply {
                val origin = session.headers["origin"] ?: "*"
                addHeader("Access-Control-Allow-Origin", origin)
                addHeader("Access-Control-Allow-Credentials", "true")
            }

        var okHttpResponse: okhttp3.Response? = null
        return try {
            val client = OkHttpClientProvider.getOkHttpClient()
            val requestBuilder = Request.Builder().url(targetUrl)

            val finalHeaders = mutableMapOf<String, String>()

            for ((key, value) in session.headers) {
                if (!key.startsWith("x-ln-forward-header-")) {
                    finalHeaders[key.lowercase()] = value
                }
            }

            for ((key, value) in session.headers) {
                if (key.startsWith("x-ln-forward-header-")) {
                    val realKey = key.removePrefix("x-ln-forward-header-")
                    finalHeaders[realKey.lowercase()] = value
                }
            }

            val blockList = setOf("host", "origin", "accept-encoding", "content-length", "content-type", "cookie")
            for ((key, value) in finalHeaders) {
                if (key !in blockList) {
                    requestBuilder.header(key, value)
                }
            }

            val cookieManager = android.webkit.CookieManager.getInstance()
            val webViewCookies = cookieManager.getCookie(targetUrl)
            val pluginCookie = finalHeaders["cookie"]
            
            val mergedCookies = listOfNotNull(
                pluginCookie?.takeIf { it.isNotBlank() },
                webViewCookies?.takeIf { it.isNotBlank() }
            ).joinToString("; ")
            
            if (mergedCookies.isNotEmpty()) {
                requestBuilder.header("Cookie", mergedCookies)
            }

            val method = session.method.name
            val permitsBody = method == "POST" || method == "PUT" || method == "PATCH" || method == "DELETE"
            val requiresBody = method == "POST" || method == "PUT" || method == "PATCH"
            
            val lengthStr = session.headers["content-length"]
            val contentLength = lengthStr?.toLongOrNull() ?: 0L

            var requestBody: RequestBody? = null
            if (permitsBody && contentLength > 0L) {
                requestBody = object : RequestBody() {
                    override fun contentType() = session.headers["content-type"]?.toMediaTypeOrNull()
                    override fun contentLength(): Long = contentLength
                    override fun writeTo(sink: BufferedSink) {
                        val buffer = ByteArray(8192)
                        var totalRead = 0L
                        while (totalRead < contentLength) {
                            val toRead = minOf(buffer.size.toLong(), contentLength - totalRead).toInt()
                            val read = session.inputStream.read(buffer, 0, toRead)
                            if (read == -1) break
                            sink.write(buffer, 0, read)
                            sink.flush()
                            totalRead += read
                        }
                    }
                }
            } else if (requiresBody) {
                requestBody = EMPTY_BYTE_ARRAY.toRequestBody(null)
            }

            requestBuilder.method(method, requestBody)

            val response = client.newCall(requestBuilder.build()).execute()
            okHttpResponse = response
            
            val bodyStream = response.body?.byteStream() ?: java.io.ByteArrayInputStream(EMPTY_BYTE_ARRAY)
            val customInputStream = object : FilterInputStream(bodyStream) {
                private var isClosed = false
                override fun close() {
                    if (!isClosed) {
                        isClosed = true
                        super.close()
                        response.close()
                    }
                }
            }
            
            val nanoStatus = Response.Status.lookup(response.code) ?: object : Response.IStatus {
                override fun getDescription(): String = "${response.code} ${response.message}"
                override fun getRequestStatus(): Int = response.code
            }
            
            val contentType = response.header("Content-Type") ?: "application/octet-stream"
            val nanoResponse = newChunkedResponse(nanoStatus, contentType, customInputStream)
            
            val origin = session.headers["origin"] ?: "*"
            nanoResponse.addHeader("Access-Control-Allow-Origin", origin)
            nanoResponse.addHeader("Access-Control-Allow-Credentials", "true")
            
            val exposeHeaders = mutableSetOf<String>()
            
            for (i in 0 until response.headers.size) {
                val name = response.headers.name(i)
                val value = response.headers.value(i)
                
                if (name.equals("Set-Cookie", true)) {
                    cookieManager.setCookie(targetUrl, value)
                }
                
                if (!name.equals("Content-Encoding", true) && 
                    !name.equals("Transfer-Encoding", true) && 
                    !name.equals("Content-Length", true) &&
                    !name.equals("Content-Type", true) &&
                    !name.equals("Access-Control-Allow-Origin", true) &&
                    !name.equals("Access-Control-Allow-Credentials", true) &&
                    !name.equals("Access-Control-Expose-Headers", true)) {
                    nanoResponse.addHeader(name, value)
                    exposeHeaders.add(name)
                }
            }
            cookieManager.flush()
            
            if (exposeHeaders.isNotEmpty()) {
                nanoResponse.addHeader("Access-Control-Expose-Headers", exposeHeaders.joinToString(", "))
            }
            
            nanoResponse
        } catch (e: Exception) {
            Log.e(TAG, "Proxy error", e)
            okHttpResponse?.close()
            val errRes = newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", e.message)
            val origin = session.headers["origin"] ?: "*"
            errRes.addHeader("Access-Control-Allow-Origin", origin)
            errRes.addHeader("Access-Control-Allow-Credentials", "true")
            errRes
        }
    }

    private fun getMimeType(fileName: String): String {
        val ext = MimeTypeMap.getFileExtensionFromUrl(fileName) ?: fileName.substringAfterLast('.', "")
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.lowercase()) ?: when (ext.lowercase()) {
            "css" -> "text/css"
            "js" -> "application/javascript"
            "html", "htm", "xhtml" -> "text/html"
            "json" -> "application/json"
            "xml", "opf", "ncx" -> "application/xml"
            "svg" -> "image/svg+xml"
            "woff" -> "font/woff"
            "woff2" -> "font/woff2"
            "ttf" -> "font/ttf"
            "otf" -> "font/otf"
            else -> "application/octet-stream"
        }
    }
}
