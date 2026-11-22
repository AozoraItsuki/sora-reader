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

Releases are built in CI, not locally. `package.json` is the single version source: Gradle derives `versionName`/`versionCode` from it, and CI derives semver release tags `v<version>-ci.<run number>` from it. The release build verifies the signing keystore before compiling; a separate write-scoped job attaches the tag to the exact commit that produced the APKs and marks it latest only for `main` + `arch=all` (other runs are prereleases). Build steps use read-only tokens, artifacts carry a short commit SHA, and workflows pass the full commit to the env generator.

```sh
# Requires the repository secrets KEYSTORE_B64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD.
gh workflow run android-build.yml --ref <branch> -f variant=release -f arch=all
gh run list --workflow=android-build.yml --limit 3
```

`arch=all` produces `app-arm64-v8a-release.apk` and `app-armeabi-v7a-release.apk`, uploaded as workflow artifacts and release assets. Use `arch=arm64-v8a` or `arch=armeabi-v7a` for a single ABI. Debug builds need no signing secrets. The in-app updater ignores non-semver tags (e.g. `build-61`), compares versions properly (including `-ci.N`), and picks the APK matching the device ABI (arm64-v8a first, armeabi-v7a fallback). A cached Android SDK is health-checked and reinstalled automatically if a component is missing.

A local release build requires all four signing variables (`KEYSTORE_FILE` plus `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`); Gradle fails fast instead of silently signing with the debug key:

```sh
KEYSTORE_FILE=/path/to/release.keystore KEYSTORE_PASSWORD=... KEY_ALIAS=... KEY_PASSWORD=... \
  pnpm rock build:android --variant release
```

Codemagic remains an alternate release path using the same `v<version>-ci.<build>` tags (always prerelease, never latest). `Native Android Build` runs `:app:testDebugUnitTest` before assembly; native releases are signed with the same keystore secrets and are no longer marked `-unsigned`. Third-party actions are pinned to commit SHAs; Dependabot keeps them updated.

Useful scripts: `pnpm jest` (tests), `pnpm run type-check` (`tsc --noEmit`), `pnpm run lint`, `pnpm run format:check`, `pnpm run generate:string-types`.

## Plugins

No affiliation with content providers. Plugins live in a separate repository; bundled local-plugin support included.

## Translation

Holds `strings/languages/{en,id_ID}` plus Crowdin config (`crowdin.yml`); run the string-types generator after editing.

## License

MIT — see [LICENSE](./LICENSE) (copyright retained from upstream).
