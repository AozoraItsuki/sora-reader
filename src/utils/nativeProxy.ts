import { NativeModules } from 'react-native';
import {
  defaultProxyConfig,
  DOWNLOAD_SETTINGS,
  DownloadSettings,
  initialDownloadSettings,
  ProxyConfig,
} from '@hooks/persisted/useSettings';
import { getMMKVObject } from '@utils/mmkv/mmkv';

const { NativeProxy } = NativeModules;

export function applyNativeProxy(proxy: ProxyConfig) {
  if (!NativeProxy?.setProxy) {
    return;
  }
  const merged: ProxyConfig = { ...defaultProxyConfig, ...proxy };
  NativeProxy.setProxy(
    merged.mode,
    merged.host,
    parseInt(merged.port, 10) || 0,
    merged.username,
    merged.password,
  );
}

export function clearNativeProxy() {
  if (NativeProxy?.clearProxy) {
    NativeProxy.clearProxy();
  }
}

/**
 * Called once at app startup to restore the saved proxy settings
 * into the native OkHttp client before any network request is made.
 */
export function restoreNativeProxyFromStorage() {
  const settings =
    getMMKVObject<DownloadSettings>(DOWNLOAD_SETTINGS) || initialDownloadSettings;
  const proxy = settings.proxy || defaultProxyConfig;
  if (proxy.mode !== 'disabled') {
    applyNativeProxy(proxy);
  }
}
