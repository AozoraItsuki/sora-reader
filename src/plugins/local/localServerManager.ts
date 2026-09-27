import { APP_SETTINGS } from '@hooks/persisted/useSettings';
import { ensureSafPermission, getSafTreeUri } from '@services/saf/safFile';
import NativeLocalServer from '@specs/NativeLocalServer';
import { MMKVStorage } from '@utils/mmkv/mmkv';

let serverStarted = false;

/**
 * Initialize the local HTTP server.
 * Should be called once during app startup.
 */
export const initLocalServer = async (): Promise<void> => {
  if (serverStarted) {
    console.info(
      '[LocalServer] Already started, URL:',
      NativeLocalServer.getServerUrl(),
    );
    return;
  }
  try {
    const appSettingsStr = MMKVStorage.getString(APP_SETTINGS);
    let allowProxyAPI = false;
    if (appSettingsStr) {
      try {
        const settings = JSON.parse(appSettingsStr);
        allowProxyAPI = !!settings.allowProxyAPI;
      } catch {}
    }
    NativeLocalServer.setAllowProxyAPI(allowProxyAPI);

    // The download tree has to reach the native module before the server
    // starts, otherwise it would keep serving the legacy app-private
    // directory. A revoked permission falls back to that directory.
    const treeUri = getSafTreeUri();
    if (treeUri) {
      if (await ensureSafPermission()) {
        NativeLocalServer.setSafTreeUri(treeUri);
        console.info('[LocalServer] Serving SAF tree', treeUri);
      } else {
        NativeLocalServer.setSafTreeUri('');
        console.warn(
          '[LocalServer] SAF tree permission not granted, using fallback',
        );
      }
    } else {
      NativeLocalServer.setSafTreeUri('');
    }

    console.info('[LocalServer] Starting server...');
    const port = await NativeLocalServer.startServer();
    serverStarted = true;
    console.info(
      '[LocalServer] Server started on port',
      port,
      '→',
      NativeLocalServer.getServerUrl(),
    );
  } catch (e) {
    console.error('[LocalServer] Failed to start:', e);
  }
};

/**
 * Get the current local server base URL (e.g. "http://127.0.0.1:54321").
 * Returns empty string if server is not running.
 */
export const getLocalServerUrl = (): string => {
  return NativeLocalServer.getServerUrl();
};

/**
 * Build a full URL to a local file served by the HTTP server.
 * The path should be relative to NOVEL_STORAGE (e.g. "local/115/12377/index.html").
 */
export const getLocalFileUrl = (relativePath: string): string => {
  const baseUrl = getLocalServerUrl();
  console.info('[LocalServer] Local server URL: ', baseUrl);
  console.info('[LocalServer] Relative path: ', relativePath);
  if (!baseUrl) {
    return '';
  }
  // Remove leading slash if present
  const cleanPath = relativePath.startsWith('/')
    ? relativePath.substring(1)
    : relativePath;
  return `${baseUrl}/${cleanPath}`;
};
