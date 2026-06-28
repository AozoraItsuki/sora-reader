package com.AozoraItsuki.NativeProxy

object ProxyConfig {
    @Volatile var mode: String = "disabled"
    @Volatile var host: String = ""
    @Volatile var port: Int = 0
    @Volatile var username: String = ""
    @Volatile var password: String = ""
}
