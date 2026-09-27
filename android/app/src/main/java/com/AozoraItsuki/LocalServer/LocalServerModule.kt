package com.AozoraItsuki.LocalServer

import android.net.Uri
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.sorareader.spec.NativeLocalServerSpec
import java.io.File

class LocalServerModule(context: ReactApplicationContext) : NativeLocalServerSpec(context) {
    companion object {
        private const val TAG = "LocalServerModule"
        private const val NOVELS_DIR = "Novels"
        @Volatile private var mHttpServer: LocalHttpServer? = null
        @Volatile private var mServerUrl: String = ""
        @Volatile private var mAllowProxyAPI: Boolean = false

        /**
         * Storage Access Framework tree selected by the user. Null until JS has
         * ensured the persisted permission and pushed the uri in.
         */
        @Volatile private var mSafTreeUri: Uri? = null
    }

    /**
     * The SAF tree, or null to serve the legacy app-private directory.
     * Read through a provider so ordering with [startServer] does not matter.
     */
    private val safSourceProvider: () -> LocalHttpServer.SafSource? = {
        mSafTreeUri?.let { LocalHttpServer.SafSource(reactApplicationContext, it) }
    }

    @ReactMethod
    override fun setSafTreeUri(uri: String) {
        mSafTreeUri = if (uri.isBlank()) null else runCatching { Uri.parse(uri) }.getOrNull()
        Log.i(TAG, "SAF tree ${mSafTreeUri ?: "unset (legacy fallback)"}")
    }

    @ReactMethod
    override fun startServer(promise: Promise) {
        try {
            if (mHttpServer?.isAlive == true) {
                promise.resolve(mHttpServer!!.listeningPort)
                return
            }

            val basePath = reactApplicationContext.getExternalFilesDir(null)?.absolutePath
                ?: throw RuntimeException("External files directory not available")

            val novelsPath = File(basePath, NOVELS_DIR).absolutePath

            // Use port 0 to let the OS assign a random available port
            val httpServer = LocalHttpServer(0, novelsPath, safSourceProvider)
            httpServer.allowProxyAPI = mAllowProxyAPI
            httpServer.start()

            mHttpServer = httpServer
            val port = httpServer.listeningPort
            mServerUrl = "http://127.0.0.1:$port"
            Log.i(TAG, "Local server started at $mServerUrl")
            promise.resolve(port)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server", e)
            promise.reject("SERVER_START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    override fun stopServer(promise: Promise) {
        try {
            mHttpServer?.stop()
            mHttpServer = null
            mServerUrl = ""
            Log.i(TAG, "Local server stopped")
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SERVER_STOP_ERROR", e.message, e)
        }
    }

    override fun getServerUrl(): String {
        return mServerUrl
    }

    override fun setAllowProxyAPI(allow: Boolean) {
        mAllowProxyAPI = allow
        mHttpServer?.allowProxyAPI = allow
    }
}
