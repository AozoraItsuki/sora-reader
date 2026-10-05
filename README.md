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
pnpm rock build:android --variant release                          # release APK
```

CI is manual-only: GitHub Actions (`Build`, workflow_dispatch with variant + ABI selector, per-ABI APKs, Gradle/SDK/pnpm caching) and a Codemagic release workflow. Pushing never triggers a build.

Useful scripts: `pnpm jest` (tests), `pnpm run type-check` (`tsc --noEmit`), `pnpm run lint`, `pnpm run format:check`, `pnpm run generate:string-types`.

## Plugins

No affiliation with content providers. Plugins live in a separate repository; bundled local-plugin support included.

## Translation

Holds `strings/languages/{en,id_ID}` plus Crowdin config (`crowdin.yml`); run the string-types generator after editing.

## License

MIT — see [LICENSE](./LICENSE) (copyright retained from upstream).
