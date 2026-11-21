# SoraReader Native - Parity Checklist

Status: **in progress**. Honest parity tracker for Kotlin+Compose Material 3 rebuild in `native-android/`. **Not 100% parity** with legacy RN app.

## Core
- [x] Native Android project (Kotlin, Compose, Material 3, Gradle Kotlin DSL)
- [x] Room schema: novels/chapters/categories/novel_categories/repositories/reading_history
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
- [~] Backup placeholder manager only
- [ ] SAF/shared storage migration parity
- [ ] EPUB/PDF import/export parity
- [ ] Backup local ZIP/Drive/self-host parity

## Settings / More
- [x] Basic settings
- [x] Repositories, Downloads, Categories, Statistics, About screens
- [ ] Full settings parity, task queue detail, update checker, stats parity depth

## Verification
- [x] Kotlin static brace sanity check (local node script)
- [ ] `./gradlew :app:assembleDebug` (requires Android SDK/JDK)
- [ ] Unit/instrumented tests
