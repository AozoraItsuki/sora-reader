// @ts-check
import { platformAndroid } from '@rock-js/platform-android';
import { pluginMetro } from '@rock-js/plugin-metro';
//import { loadEnvFile } from 'node:process';

// Loads environment variables from the default .env file
//loadEnvFile();

// NOTE: no remoteCacheProvider on purpose. Rock's GitHub provider can only
// FETCH (its upload() throws "not supported through GitHub API"), nothing in
// `rock build:android` ever uploads, and the cache is single-binary while we
// ship one APK per ABI with per-run versionCodes — a hit would serve the
// wrong/stale binary. Build reuse comes from the Gradle build cache
// (org.gradle.caching=true) persisted by gradle/actions/setup-gradle instead.

/** @type {import('rock').Config} */
export default {
  bundler: pluginMetro(),
  platforms: {
    android: platformAndroid(),
  },
};
