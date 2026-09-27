import './mocks';

import {
  deleteCachedNovels as _deleteCachedNovels,
  getCachedNovels as _getCachedNovels,
} from '@database/queries/NovelQueries';
import { deleteCachedNovels, useNovel } from '@hooks/persisted/useNovel';
import {
  keyContract,
  novelPersistence,
} from '@hooks/persisted/useNovel/store-helper/contracts';
import { TRACKED_NOVEL_PREFIX } from '@hooks/persisted/useTrackedNovel';
import { safUnlink } from '@services/saf/safFile';
import { MMKVStorage } from '@utils/mmkv/mmkv';

jest.mock('@services/saf/safFile', () => ({
  safUnlink: jest.fn().mockResolvedValue(true),
}));

describe('useNovel (legacy retirement)', () => {
  it('throws with guidance to use store selectors', () => {
    expect(() => useNovel()).toThrow(
      'useNovel has been retired. Access novel domain state/actions via useNovelContext().novelStore selectors.',
    );
  });
});

describe('deleteCachedNovels', () => {
  const cachedNovels = [
    { id: 10, pluginId: 'p1', path: '/n/1', name: 'N1', inLibrary: false },
    { id: 11, pluginId: 'p2', path: '/n/2', name: 'N2', inLibrary: false },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    MMKVStorage.clearAll();
    (_getCachedNovels as jest.Mock).mockResolvedValue(cachedNovels);
    (safUnlink as jest.Mock).mockResolvedValue(true);
  });

  it('clears tracked novel and legacy persistence keys for each cached novel', async () => {
    for (const novel of cachedNovels) {
      MMKVStorage.set(`${TRACKED_NOVEL_PREFIX}_${novel.id}`, 'tracked');
      MMKVStorage.set(
        keyContract.pageIndex({
          pluginId: novel.pluginId,
          novelPath: novel.path,
        }),
        4,
      );
      MMKVStorage.set(
        keyContract.settings({
          pluginId: novel.pluginId,
          novelPath: novel.path,
        }),
        JSON.stringify({ filter: [], showChapterTitles: true }),
      );
      MMKVStorage.set(
        keyContract.lastRead({
          pluginId: novel.pluginId,
          novelPath: novel.path,
        }),
        JSON.stringify({ id: 1 }),
      );
    }

    await deleteCachedNovels();

    for (const novel of cachedNovels) {
      expect(MMKVStorage.contains(`${TRACKED_NOVEL_PREFIX}_${novel.id}`)).toBe(
        false,
      );
      expect(
        MMKVStorage.contains(
          keyContract.pageIndex({
            pluginId: novel.pluginId,
            novelPath: novel.path,
          }),
        ),
      ).toBe(false);
      expect(
        MMKVStorage.contains(
          novelPersistence.keys.settings({
            pluginId: novel.pluginId,
            novelPath: novel.path,
          }),
        ),
      ).toBe(false);
      expect(
        MMKVStorage.contains(
          novelPersistence.keys.lastRead({
            pluginId: novel.pluginId,
            novelPath: novel.path,
          }),
        ),
      ).toBe(false);
    }
  });

  it('unlinks the novel directory in the SAF download tree', async () => {
    await deleteCachedNovels();

    for (const novel of cachedNovels) {
      expect(safUnlink).toHaveBeenCalledWith(
        `Novels/${novel.pluginId}/${novel.id}`,
      );
    }
  });

  it('still clears the database when the tree delete fails', async () => {
    (safUnlink as jest.Mock).mockRejectedValue(new Error('no tree'));

    await expect(deleteCachedNovels()).resolves.toBeUndefined();
    expect(_deleteCachedNovels).toHaveBeenCalledTimes(1);
  });

  it('calls database cached-novel delete after cleanup', async () => {
    await deleteCachedNovels();

    expect(_deleteCachedNovels).toHaveBeenCalledTimes(1);
  });
});
