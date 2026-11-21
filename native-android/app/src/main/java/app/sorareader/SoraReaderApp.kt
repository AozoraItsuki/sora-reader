package app.sorareader

import android.app.Application
import app.sorareader.di.AppContainer

class SoraReaderApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
