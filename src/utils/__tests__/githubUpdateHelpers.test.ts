import {
  normalizeReleaseTag,
  selectApkDownloadUrl,
} from '../../hooks/common/useGithubUpdateChecker';

describe('github update helpers', () => {
  it('only accepts semver release tags', () => {
    expect(normalizeReleaseTag('build-61')).toBeNull();
    expect(normalizeReleaseTag('v2.0.4-ci.63')).toBe('2.0.4-ci.63');
    expect(normalizeReleaseTag('2.0.4')).toBe('2.0.4');
  });

  it('picks the APK matching the device ABI', () => {
    const assets = [
      {
        name: 'app-armeabi-v7a-release.apk',
        browser_download_url: 'https://example.com/armv7.apk',
      },
      {
        name: 'app-arm64-v8a-release.apk',
        browser_download_url: 'https://example.com/arm64.apk',
      },
    ];

    expect(selectApkDownloadUrl(assets, ['arm64-v8a'])).toBe(
      'https://example.com/arm64.apk',
    );
    expect(selectApkDownloadUrl(assets, ['armeabi-v7a'])).toBe(
      'https://example.com/armv7.apk',
    );
  });

  it('does not hand back an arbitrary APK when labels do not match', () => {
    const assets = [
      { name: 'a.apk', browser_download_url: 'https://example.com/a.apk' },
      { name: 'b.apk', browser_download_url: 'https://example.com/b.apk' },
    ];
    expect(selectApkDownloadUrl(assets, ['arm64-v8a'])).toBe('');
  });
});
