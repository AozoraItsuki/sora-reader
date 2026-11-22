plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.kotlin.serialization)
}

// package.json is the single source of truth for the public app version,
// the same way android/app/build.gradle derives it for the legacy app.
val rootPackageJson = file("../../package.json")
val appVersion = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    .find(rootPackageJson.readText())
    ?.groupValues?.get(1)?.trim()
    ?: throw GradleException("Cannot read version from ${rootPackageJson}.")
val versionMatch = Regex("^(\\d+)\\.(\\d+)\\.(\\d+)$").matchEntire(appVersion)
    ?: throw GradleException("package.json version must be X.Y.Z (got '$appVersion').")
val versionMajor = versionMatch.groupValues[1].toInt()
val versionMinor = versionMatch.groupValues[2].toInt()
val versionPatch = versionMatch.groupValues[3].toInt()

// Mirrors the legacy app's version-code scheme; CI_BUILD_NUMBER makes each CI
// build installable over the previous one. Missing/garbage values fall back to 0.
val ciBuildNumberRaw = (System.getenv("CI_BUILD_NUMBER") ?: "0").trim()
val ciBuildOffset = ciBuildNumberRaw.toIntOrNull()?.takeIf { it >= 0 } ?: 0
val baseVersionCode = (((versionMajor shl 10) or versionMinor) shl 11) or versionPatch
val appVersionCode = baseVersionCode + ciBuildOffset

val releaseEnvKeys = listOf("KEYSTORE_FILE", "KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD")
fun releaseEnv(name: String): String? = System.getenv(name)?.takeIf { it.isNotBlank() }

android {
    namespace = "app.sorareader"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.sorareader"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersion

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    signingConfigs {
        create("release") {
            // Placeholder values keep debug-only builds configurable. The task
            // graph guard below fails release tasks with a clear GradleException
            // when the real signing secrets are absent.
            storeFile = file(releaseEnv("KEYSTORE_FILE") ?: "release.keystore")
            storePassword = releaseEnv("KEYSTORE_PASSWORD") ?: ""
            keyAlias = releaseEnv("KEY_ALIAS") ?: ""
            keyPassword = releaseEnv("KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    ksp {
        // No Room schema JSON is committed, and SoraDatabase sets exportSchema = false.
        arg("room.incremental", "true")
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

// Fail before any work when a release task is requested without signing env.
// Checking the task graph (not configuration) keeps debug builds working,
// since AGP configures both debug and release variants on every build.
gradle.taskGraph.whenReady {
    val graph = it
    val wantsRelease = graph.allTasks.any { task ->
        task.name.contains("release", ignoreCase = true) &&
            !task.name.contains("prerelease", ignoreCase = true)
    }
    if (wantsRelease) {
        val missing = releaseEnvKeys.filter { releaseEnv(it) == null }
        if (missing.isNotEmpty()) {
            throw GradleException(
                "Release builds require ${missing.joinToString(", ")}. " +
                    "Set KEYSTORE_FILE (absolute path), KEYSTORE_PASSWORD, KEY_ALIAS and KEY_PASSWORD (CI reads them from secrets)."
            )
        }
    }
}

dependencies {
    coreLibraryDesugaring(libs.desugar.jdk.libs)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material3.adaptive.navigation.suite)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)

    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)

    implementation(libs.coil.compose)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.jsoup)
    implementation(libs.okio)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}
