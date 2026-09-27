import { TurboModule, TurboModuleRegistry } from 'react-native';

/**
 * Storage Access Framework access to the user-picked download tree.
 *
 * Every `relPath` is RELATIVE to the tree root and uses `/` separators, e.g.
 * `Novels/{pluginId}/{novelId}/{chapterId}/index.html`. The native side walks
 * the tree with `DocumentFile.fromTreeUri` and streams through
 * `ContentResolver`, so the tree itself is never touched with `java.io.File`.
 */
export interface Spec extends TurboModule {
  /**
   * Re-grant and persist access to a tree the user already picked, so the
   * grant survives process death and reboots. Rejects when the provider
   * refused a persistable grant or the uri is no longer valid.
   */
  takePersistablePermission: (
    treeUri: string,
    readWrite: boolean,
  ) => Promise<boolean>;
  /** Drop the persisted grant. Best effort — never rejects. */
  releaseTreeUri: (treeUri: string) => Promise<boolean>;
  /** True when the tree is still readable and writable by this app. */
  hasTreeAccess: (treeUri: string) => Promise<boolean>;
  /** Create `relPath` and every missing parent directory. Idempotent. */
  mkdir: (treeUri: string, relPath: string) => Promise<boolean>;
  /** True when the relative path resolves to an existing file or directory. */
  exists: (treeUri: string, relPath: string) => Promise<boolean>;
  isDirectory: (treeUri: string, relPath: string) => Promise<boolean>;
  /**
   * Write `data`, creating parents as needed and truncating an existing file.
   * `encoding` is `utf8` (default) or `base64`; the stored MIME type is
   * sniffed from the payload and falls back to the file extension.
   */
  writeFile: (
    treeUri: string,
    relPath: string,
    data: string,
    encoding: string,
  ) => Promise<boolean>;
  /** Read a file as `utf8` text or as `base64`, per `encoding`. */
  readFile: (
    treeUri: string,
    relPath: string,
    encoding: string,
  ) => Promise<string>;
  /** Recursively remove a file or directory. Resolves false when absent. */
  unlink: (treeUri: string, relPath: string) => Promise<boolean>;
  /** Display names of the direct children of a relative directory. */
  readDir: (treeUri: string, relPath: string) => Promise<string[]>;
  /** Move a file or directory, falling back to copy + delete. */
  move: (
    treeUri: string,
    fromRelPath: string,
    toRelPath: string,
  ) => Promise<boolean>;
  /** Recursive size in bytes; 0 when absent. */
  getFileSize: (treeUri: string, relPath: string) => Promise<number>;
  /**
   * Stream an HTTP(S) response straight into the tree, gzip-decoding when the
   * server compressed the body and sniffing the MIME type from the payload.
   */
  downloadFile: (
    treeUri: string,
    url: string,
    relPath: string,
    method: string,
    headers: { [key: string]: string },
    body?: string,
  ) => Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeSaf');
