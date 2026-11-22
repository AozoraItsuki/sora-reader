import Config from '@env';
import { newer } from '@utils/compareVersion';
import { GITHUB_REPO, GITHUB_USER } from '@utils/constants/metadata';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { useCallback, useEffect, useState } from 'react';
import { supportedAbis, supportedAbisSync } from 'react-native-device-info';

import { version } from '../../../package.json';

const { GIT_HASH, BUILD_TYPE } = Config;

export interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

export interface GithubUpdateRelease {
  tag_name: string;
  body: string;
  downloadUrl: string;
  commitHash?: string;
}

export interface GithubUpdate {
  isNewVersion: boolean;
  latestRelease: GithubUpdateRelease | undefined;
}

const LAST_UPDATE_CHECK_KEY = 'LAST_UPDATE_CHECK';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const BETA_RELEASE_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/tags/beta`;
const LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`;

// Only real app versions are considered. CI tags such as "build-61" or
// "codemagic-abc1234" must never be parsed as version "61".
const SEMVER_TAG_RE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const ARM64 = 'arm64-v8a';
const ARMV7 = 'armeabi-v7a';

/**
 * Parse commit hash from beta release body.
 * Expected format: `- **Commit Hash**: [<hash>](<url>)`
 */
const parseCommitHash = (body: string): string | null => {
  const match = body?.match(/\*\*Commit Hash\*\*.*?\[([a-f0-9]+)\]/i);
  return match?.[1] ?? null;
};

/**
 * Returns the semver part of a release tag (without a leading "v"), or null
 * when the tag is not a version tag.
 */
export const normalizeReleaseTag = (tag: unknown): string | null => {
  if (typeof tag !== 'string') {
    return null;
  }
  return SEMVER_TAG_RE.exec(tag.trim())?.[1] ?? null;
};

const isApk = (asset: GithubReleaseAsset): boolean =>
  /\.apk($|\?)/i.test(`${asset?.name || ''} ${asset?.browser_download_url || ''}`);

const matchesAbi = (asset: GithubReleaseAsset, abi: string): boolean =>
  `${asset?.name || ''} ${asset?.browser_download_url || ''}`.includes(abi);

/**
 * Pick the APK built for the device ABI. arm64-v8a is preferred, armeabi-v7a
 * is the fallback. An unknown/unlabelled single APK is accepted only when it
 * is the sole candidate; otherwise no URL is returned instead of blindly
 * handing back assets[0] with the wrong ABI.
 */
export const selectApkDownloadUrl = (
  assets: unknown,
  deviceAbis: readonly string[],
): string => {
  if (!Array.isArray(assets)) {
    return '';
  }

  const apks = assets.filter(
    (asset: GithubReleaseAsset) =>
      asset && typeof asset.browser_download_url === 'string' && isApk(asset),
  );
  if (apks.length === 0) {
    return '';
  }

  const prefersArm64 = deviceAbis.some(
    abi => abi === ARM64 || abi === 'arm64',
  );
  const prefersArmv7 = deviceAbis.some(
    abi => abi === ARMV7 || abi === 'armeabi',
  );
  const preferredAbis: string[] = [];
  if (prefersArm64) {
    preferredAbis.push(ARM64);
  }
  if (prefersArmv7) {
    preferredAbis.push(ARMV7);
  }
  if (preferredAbis.length === 0) {
    // No ABI information: still prefer 64-bit, then 32-bit.
    preferredAbis.push(ARM64, ARMV7);
  }

  for (const abi of preferredAbis) {
    const match = apks.find(asset => matchesAbi(asset, abi));
    if (match) {
      return match.browser_download_url || '';
    }
  }

  const hasLabelledApk = apks.some(
    asset => matchesAbi(asset, ARM64) || matchesAbi(asset, ARMV7),
  );
  return !hasLabelledApk && apks.length === 1
    ? apks[0].browser_download_url || ''
    : '';
};

const getDeviceAbis = async (): Promise<string[]> => {
  try {
    return await supportedAbis();
  } catch {
    try {
      return supportedAbisSync();
    } catch {
      return [];
    }
  }
};

/**
 * Check if current build is a nightly/beta build.
 */
const isNightlyBuild = (): boolean => {
  return !!GIT_HASH && BUILD_TYPE !== 'Release';
};

/**
 * Fetch and check for updates. Works for both nightly and stable builds.
 * - Nightly/beta: compares GIT_HASH with the latest beta release's commit hash
 * - Stable: compares semver version with the latest GitHub release
 */
export const fetchUpdateInfo = async (): Promise<GithubUpdate> => {
  try {
    const deviceAbis = await getDeviceAbis();

    // For nightly/beta builds: check the beta release tag
    if (isNightlyBuild()) {
      const res = await fetch(BETA_RELEASE_URL);
      if (res.ok) {
        const data = await res.json();
        const remoteCommitHash = parseCommitHash(data.body || '');

        if (
          remoteCommitHash &&
          remoteCommitHash.slice(0, 8) !== GIT_HASH.slice(0, 8)
        ) {
          return {
            isNewVersion: true,
            latestRelease: {
              tag_name: `beta (${remoteCommitHash})`,
              body: data.body || '',
              downloadUrl: selectApkDownloadUrl(data.assets, deviceAbis),
              commitHash: remoteCommitHash,
            },
          };
        }
      }
    }

    // Check stable version bumps; non-version tags are ignored entirely.
    const res = await fetch(LATEST_RELEASE_URL);
    if (res.ok) {
      const data = await res.json();
      const newVersion = normalizeReleaseTag(data?.tag_name);

      if (newVersion && newer(newVersion, `${version}`)) {
        return {
          isNewVersion: true,
          latestRelease: {
            tag_name: data.tag_name,
            body: data.body || '',
            downloadUrl: selectApkDownloadUrl(data.assets, deviceAbis),
          },
        };
      }
    }
  } catch {
    // Silently fail in offline mode or on network errors
  }

  return { isNewVersion: false, latestRelease: undefined };
};

/**
 * Hook that auto-checks for updates on mount (with 24h cooldown).
 * Used in Main.tsx to show the NewUpdateDialog.
 */
export const useGithubUpdateChecker = (): GithubUpdate => {
  const [result, setResult] = useState<GithubUpdate>({
    isNewVersion: false,
    latestRelease: undefined,
  });

  const shouldCheckForUpdate = (): boolean => {
    const lastCheckTime = MMKVStorage.getNumber(LAST_UPDATE_CHECK_KEY);
    if (!lastCheckTime) {
      return true;
    }
    return Date.now() - lastCheckTime >= ONE_DAY_MS;
  };

  const checkForRelease = useCallback(async () => {
    if (!shouldCheckForUpdate()) {
      return;
    }

    const updateInfo = await fetchUpdateInfo();
    MMKVStorage.set(LAST_UPDATE_CHECK_KEY, Date.now());
    setResult(updateInfo);
  }, []);

  useEffect(() => {
    checkForRelease();
  }, [checkForRelease]);

  return result;
};
