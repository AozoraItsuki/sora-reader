package com.AozoraItsuki.NativeProxy

import android.content.Context
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.Authenticator
import okhttp3.Credentials
import okhttp3.OkHttpClient
import java.net.InetSocketAddress
import java.net.Proxy

class ProxyClientFactory(private val context: Context) : OkHttpClientFactory {

    override fun createNewNetworkModuleClient(): OkHttpClient {
        val builder = OkHttpClientProvider.createClientBuilder(context)
        applyProxy(builder)
        return builder.build()
    }

    companion object {
        fun applyProxy(builder: OkHttpClient.Builder) {
            val mode = ProxyConfig.mode
            val host = ProxyConfig.host.trim()
            val port = ProxyConfig.port

            if (mode == "disabled" || host.isEmpty() || port <= 0) {
                return
            }

            val proxyType = when (mode) {
                "http" -> Proxy.Type.HTTP
                "socks5", "tor" -> Proxy.Type.SOCKS
                else -> return
            }

            val proxy = Proxy(proxyType, InetSocketAddress.createUnresolved(host, port))
            builder.proxy(proxy)

            val username = ProxyConfig.username.trim()
            val password = ProxyConfig.password
            if (username.isNotEmpty()) {
                builder.proxyAuthenticator(Authenticator { _, response ->
                    if (response.request.header("Proxy-Authorization") != null) {
                        // Already tried auth, give up to avoid infinite loop
                        return@Authenticator null
                    }
                    response.request.newBuilder()
                        .header("Proxy-Authorization", Credentials.basic(username, password))
                        .build()
                })
            }
        }
    }
}
