import NativeLocalServer from '@specs/NativeLocalServer';
import { SHARED_NOVELS } from '@utils/Storages';

import { syncSafTreeUriToServer } from '../useSafLocation';

const nativeLocalServer = NativeLocalServer as jest.Mocked<
  typeof NativeLocalServer
>;

/**
 * Direct-only contract: exactly one root (the shared one) is ever handed to
 * the server. The SAF-tree path is deleted, so the sync takes no arguments
 * and never touches a tree uri — a mode switch cannot leave a previous
 * location behind on the native side.
 */
describe('syncSafTreeUriToServer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hands over the shared download root', () => {
    syncSafTreeUriToServer();

    expect(nativeLocalServer.setDownloadRoot).toHaveBeenCalledWith(
      SHARED_NOVELS,
    );
  });

  it('exposes no tree-uri handover at all', () => {
    syncSafTreeUriToServer();

    // setSafTreeUri was deleted from the native spec with the tree path.
    expect(
      'setSafTreeUri' in
        (nativeLocalServer as unknown as Record<string, unknown>),
    ).toBe(false);
  });

  it('swallows a native failure instead of crashing boot', () => {
    nativeLocalServer.setDownloadRoot.mockImplementationOnce(() => {
      throw new Error('native down');
    });

    expect(() => syncSafTreeUriToServer()).not.toThrow();
    expect(nativeLocalServer.setDownloadRoot).toHaveBeenCalledWith(
      SHARED_NOVELS,
    );
  });
});
