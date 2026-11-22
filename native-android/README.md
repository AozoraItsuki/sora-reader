# SoraReader Native (MVP Rebuild)

Rebuild native Android dari SoraReader menggunakan **Kotlin + Jetpack Compose + Material 3**.

## Tujuan

- Lebih ringan dan efisien dibanding stack RN/Expo lama
- UI modern Material 3 (dynamic color / Material You, edge-to-edge, adaptive navigation suite)
- Arsitektur sederhana dan mudah diiterasi

## Stack

- Kotlin, Gradle Kotlin DSL, AGP
- Jetpack Compose + Material 3
- Navigation Compose (type-safe routes)
- Room (SQLite)
- DataStore (siap untuk settings lanjutan)
- Ktor Client + OkHttp
- Coil
- Kotlin Serialization / Coroutines / Flow
- WorkManager dependency disiapkan untuk download manager lanjutan

## Struktur

```text
native-android/
  app/src/main/java/app/sorareader/
    data/        # Room entities/DAO/database, repository impl, source adapter
    domain/      # model + repository contracts
    ui/          # theme, navigation, screens (library/browse/novel/reader/settings)
    di/          # AppContainer manual DI
```

## MVP yang sudah di-scaffold

- Library: daftar novel yang disimpan, empty state
- Browse: pilih source, search, tambah ke library
- Novel detail: metadata, daftar chapter, toggle library
- Reader: render konten chapter, simpan progress baca, cache konten lokal sederhana
- Settings: placeholder pengaturan inti (Material 3 UI)
- Data: Room schema untuk Novel/Chapter/Category
- Source: `SimpleSourceCatalog` sebagai format sumber sederhana (demo) yang bisa diganti adapter JSON/HTTP ringan

## Format plugin/sumber sederhana (arah MVP)

MVP ini sengaja memakai kontrak Kotlin `SourceCatalog`:

- `availableSources()`
- `browse(sourceId, query, page)`
- `fetchNovelDetails(sourceId, novelUrl)`
- `fetchChapters(sourceId, novelUrl)`
- `fetchChapterContent(sourceId, chapterUrl)`

Untuk fase berikutnya, adapter bisa membaca manifest JSON ringan (id, name, lang, endpoint/selectors/rules) tanpa menjalankan JS plugin lama secara langsung.

## Build

Butuh Android SDK + JDK 17.

Debug tetap bisa dibangun tanpa secret apa pun (memakai debug key default AGP):

```bash
cd native-android
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
```

Release wajib ditandatangani dengan kunci yang sama seperti aplikasi legacy. Gradle
membaca empat environment variable berikut dan akan melempar `GradleException`
yang menyebutkan var yang hilang sebelum task release dijalankan:

- `KEYSTORE_FILE` — path absolut ke keystore
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

```bash
KEYSTORE_FILE=/abs/path/release.keystore \
KEYSTORE_PASSWORD=... KEY_ALIAS=... KEY_PASSWORD=... \
./gradlew :app:assembleRelease
```

`versionName` berasal dari `version` di `package.json` repo root (sumber versi yang
sama dengan `android/app/build.gradle`). `versionCode` dihitung dari versi tersebut
dan ditambah `CI_BUILD_NUMBER` bila tersedia; nilai yang kosong/invalid jadi 0.
Build release CI sudah dikonfigurasi di `.github/workflows/native-android-build.yml`:
decode keystore dari secret, verifikasi dengan `keytool`, menjalankan unit test
(`:app:testDebugUnitTest`), lalu `assembleRelease` dengan keempat env var di atas.

Jika `gradle-wrapper.jar` belum ada di environment ini, generate via:

```bash
gradle wrapper --gradle-version 8.11.1
```

atau buka project di Android Studio dan biarkan sync wrapper.

## Catatan

- Ini rebuild MVP di subfolder `native-android/`; app RN lama tetap ada di root repo.
- Demo source dipakai untuk validasi flow end-to-end. Integrasi source nyata, download manager penuh, backup, TTS, PDF/EPUB, dan cloud sync adalah fase berikutnya.
- Room tidak punya schema JSON yang di-commit: `exportSchema = false` dan argumen KSP `room.schemaLocation` sudah dihapus. Tidak ada migrasi yang dideklarasikan, sehingga kenaikan versi tanpa migrasi akan gagal dengan jelas—**namun** pemanggilan `fallbackToDestructiveMigration()` di `di/AppContainer.kt` masih ada (file di luar cakupan perubahan ini) dan harus dihapus agar risiko hilangnya data benar-benar hilang.
- Backup/device-transfer (API 31+) mengecualikan database Room dan direktori `datastore` lewat `@xml/data_extraction_rules`; data lain masih boleh di-backup. Perangkat dengan API 26–30 belum punya aturan backup legacy (`android:fullBackupContent`).

## Parity status

Lihat `PARITY.md` untuk checklist jujur. Rebuild ini **belum 100% parity** dengan app RN lama; saat ini fokus pada fondasi native yang dapat dikompilasi/diiterasi di environment Android normal (JDK+SDK).
