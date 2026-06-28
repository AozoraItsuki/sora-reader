package com.AozoraItsuki.NativeProxy

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.network.OkHttpClientProvider

class ProxyModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NativeProxy"

    @ReactMethod
    fun setProxy(
        mode: String,
        host: String,
        port: Double,
        username: String,
        password: String,
    ) {
        ProxyConfig.mode = mode
        ProxyConfig.host = host
        ProxyConfig.port = port.toInt()
        ProxyConfig.username = username
        ProxyConfig.password = password
        invalidateCachedClient()
    }

    @ReactMethod
    fun clearProxy() {
        ProxyConfig.mode = "disabled"
        ProxyConfig.host = ""
        ProxyConfig.port = 0
        ProxyConfig.username = ""
        ProxyConfig.password = ""
        invalidateCachedClient()
    }

    private fun invalidateCachedClient() {
        // Try to clear the cached OkHttp client so the next request
        // rebuilds it with the new proxy settings via our factory.
        val fieldNames = listOf("sClient", "mOkHttpClient", "mClient", "okHttpClient")
        for (name in fieldNames) {
            try {
                val field = OkHttpClientProvider::class.java.getDeclaredField(name)
                field.isAccessible = true
                field.set(null, null)
                return
            } catch (_: Exception) {
                // Try next field name
            }
        }
        // If reflection fails, the proxy change will apply on next cold start.
    }
}
