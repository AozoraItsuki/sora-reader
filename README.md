# SoraReader

A free and open-source light novel reader for Android, Mihon/Tachiyomi-style library management with an Expo + React Native codebase.

> **Fork origin.** This project is a fork of [lnreader/lnreader](https://github.com/lnreader/lnreader) (via the SoraReader line), heavily modified: new build system, new storage model, and many features below. It is a personal fork, not affiliated with the upstream projects.

## Storage model

- Downloads default to shared storage at `/sdcard/SoraReader` (`Novels/{plugin}/{novel}/{chapter}/index.html`), so your library survives reinstalls and is visible in file managers. Requires the All-files-access permission once on first launch (Setup Storage screen).
- SAF folder trees remain supported as a fallback; legacy app-private downloads are migrated automatically (verify-before-delete, with a manual Migrate button in Download settings).
- Plugins stay in app-private data. A `.nomedia` is written per chapter so galleries stay clean.

## Features

- Reader: infinite scroll with chapter-sequence validation (no skipped chapters), WebView with chapter illustrations, text-to-speech, translation (Google + LLM), per-novel and global **reader terms** with custom bold/italic/underline/color (hex or RGB) managed from Settings → Terms.
- PDF: in-app viewer, import as local novel (image-only below Android 15), export chapters to PDF.
- EPUB: import and export with image support.
- Backups: selective sections (library, downloads, categories, repositories, settings) to local file, Google Drive, or self-hosted server.
- Library: updates, categories, novel merge/reconcile, reading stats, history.
- Integrations: Cloudflare challenge solver, Samsung S-Pen actions.
- Local HTTP server serves downloads to the reader; covers resolve from the new location after migration.

## Tech stack

React Native 0.83 · Expo SDK 55 · Rock 0.12 (build/run tooling) · TypeScript · Drizzle ORM + op-sqlite · MMKV · Zustand · React Native Paper · pnpm. Custom TurboModules under `android/` and `specs/` (NativeFile, NativeSaf, NativePdf, LocalServer).

## Building

Prerequisites: Node 22, pnpm 10, Java 17, Android SDK (compileSdk 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1).

```sh
pnpm install
pnpm run generate:env:debug
pnpm rock run:android --app-id-suffix "debug" --active-arch-only   # dev
pnpm rock build:android --variant debug                            # local debug APK
```

Releases are built in CI, not locally. `Build` (`.github/workflows/android-build.yml`) is manual-only (`workflow_dispatch` with variant + ABI selector, per-ABI APKs, Gradle/SDK/pnpm caching); pushing never triggers a build. The release build verifies the signing keystore before compiling and attaches its tag to the exact commit that produced the APKs:

```sh
# Requires the repository secrets KEYSTORE_B64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD.
gh workflow run android-build.yml --ref <branch> -f variant=release -f arch=all
gh run list --workflow=android-build.yml --limit 3
```

`arch=all` produces `app-arm64-v8a-release.apk` and `app-armeabi-v7a-release.apk`, uploaded both as workflow artifacts and as assets on a `build-<run number>` GitHub release. Use `arch=arm64-v8a` or `arch=armeabi-v7a` for a single ABI. Debug builds need no signing secrets.

A local release build is possible but requires all four signing variables to be exported (`KEYSTORE_FILE` pointing at a keystore, plus `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`); Gradle now fails fast instead of silently signing with the debug key:

```sh
KEYSTORE_FILE=/path/to/release.keystore KEYSTORE_PASSWORD=... KEY_ALIAS=... KEY_PASSWORD=... \
  pnpm rock build:android --variant release
```

Codemagic remains an alternate release path. `Native Android Build` builds the experimental Kotlin/Compose scaffold; its release artifact is explicitly marked `-unsigned` and is for verification only.

Useful scripts: `pnpm jest` (tests), `pnpm run type-check` (`tsc --noEmit`), `pnpm run lint`, `pnpm run format:check`, `pnpm run generate:string-types`.

## Plugins

No affiliation with content providers. Plugins live in a separate repository; bundled local-plugin support included.

## Translation

Holds `strings/languages/{en,id_ID}` plus Crowdin config (`crowdin.yml`); run the string-types generator after editing.

## License

MIT — see [LICENSE](./LICENSE) (copyright retained from upstream).
