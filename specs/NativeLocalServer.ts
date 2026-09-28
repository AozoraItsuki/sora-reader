import { TurboModule, TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  startServer: () => Promise<number>; // returns assigned port
  stopServer: () => Promise<void>;
  getServerUrl: () => string; // synchronous — returns 'http://127.0.0.1:PORT'
  setAllowProxyAPI: (allow: boolean) => void;
  /**
   * Point the server at the user-picked Storage Access Framework tree.
   * Pass an empty string to fall back to the legacy app-private directory.
   */
  setSafTreeUri: (uri: string) => void;
  /**
   * Serve chapter files from an absolute directory instead of the app-private
   * one. Used by the direct (all-files) storage backend, which needs no SAF tree.
   * An empty string clears the override and restores the default behavior.
   */
  setDownloadRoot: (path: string) => void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeLocalServer');
