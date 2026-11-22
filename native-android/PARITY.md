# SoraReader Native - Parity Checklist

Status: **in progress**. Honest parity tracker for Kotlin+Compose Material 3 rebuild in `native-android/`. **Not 100% parity** with legacy RN app.

## Core
- [x] Native Android project (Kotlin, Compose, Material 3, Gradle Kotlin DSL)
- [x] Room schema: novels/chapters/categories/novel_categories/repositories/reading_history
- [~] Room migration safety: `exportSchema = false` (no committed schemas, KSP schemaLocation removed), no migrations declared; `fallbackToDestructiveMigration()` is still present in `di/AppContainer.kt` (out of scope here), so data-loss risk remains until it is removed
- [x] DataStore settings foundation
- [x] Navigation suite: Library/Updates/History/Browse/More
- [~] Source system - `SourceCatalog` + demo + JSON manifest skeleton/remote catalog; no JS plugin runtime parity
- [~] Repository management - basic add/delete UI; remote fetch/install parity incomplete
- [ ] Full legacy plugin parity (JS runtime `@libs/*`, filters, custom JS/CSS, Cloudflare/webview)

## Library / Browse / Novel
- [x] Library list/search/empty state
- [x] Add to library from browse
- [x] Novel detail refresh/fetch, library toggle, chapter list
- [x] Download unread chapters action (WorkManager MVP)
- [x] Category assignment dialog + persistence
- [~] Categories screen basic; no advanced library category UX parity
- [ ] Advanced filters/sort/display/global search/migration parity

## Reader
- [x] Basic reader with WebView shell, local content cache, progress/history save
- [ ] WebView JS/CSS bridge parity, page/scroll gestures
- [ ] TTS/translation/AI parity
- [ ] Custom reader themes/CSS/JS, volume/S-Pen, auto-scroll parity

## Downloads / Storage / Backup
- [~] WorkManager download manager/worker + Downloads screen (no FGS/parallel/retry/Tor/proxy/notification parity)
- [~] Data extraction rules (API 31+) exclude the Room DB and DataStore prefs from cloud backup/device transfer; other data still eligible; no legacy `fullBackupContent` rules for API 26–30
- [~] Backup placeholder manager only
- [ ] SAF/shared storage migration parity
- [ ] EPUB/PDF import/export parity
- [ ] Backup local ZIP/Drive/self-host parity

## Settings / More
- [x] Basic settings
- [x] Repositories, Downloads, Categories, Statistics, About screens
- [ ] Full settings parity, task queue detail, update checker, stats parity depth

## Build / CI
- [x] Release signing configured: Gradle reads `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` and fails fast with `GradleException` when a release task lacks them; debug builds stay unsigned-by-release-key
- [x] CI workflow (`.github/workflows/native-android-build.yml`) decodes/verifies the keystore, runs unit tests, and builds signed release; no local release APK has been produced here
- [x] Version sourced from root `package.json`; `versionCode` includes `CI_BUILD_NUMBER` when present, safe fallback otherwise

## Verification
- [x] Kotlin static brace sanity check (local node script)
- [x] CI unit-test step configured: `:app:testDebugUnitTest` (not executed locally — no Android SDK)
- [ ] `./gradlew :app:assembleDebug` (requires Android SDK/JDK)
- [ ] Unit/instrumented tests run locally or in this session
- [ ] Signed release APK built and install-verified
