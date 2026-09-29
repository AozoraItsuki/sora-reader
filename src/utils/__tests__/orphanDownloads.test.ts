import { getNovelById } from '@database/queries/NovelQueries';
import NativeFile from '@specs/NativeFile';
import {
  classifyDownloadDir,
  OrphanDirInput,
  scanOrphanDownloads,
} from '@utils/orphanDownloads';
import { SHARED_NOVELS } from '@utils/Storages';

jest.mock('@database/queries/NovelQueries', () => ({
  getNovelById: jest.fn(),
}));

describe('classifyDownloadDir', () => {
  it('keeps a directory whose novel still has a database row', () => {
    const input: OrphanDirInput = {
      novelId: 7,
      hasChapterIndex: false,
      inDb: true,
    };

    expect(classifyDownloadDir(input)).toBe('keep');
  });

  it('keeps a directory that holds downloaded chapters without a db row', () => {
    const input: OrphanDirInput = {
      novelId: 9,
      hasChapterIndex: true,
      inDb: false,
    };

    expect(classifyDownloadDir(input)).toBe('keep');
  });

  it('flags a cover-only directory without a db row as orphan', () => {
    const input: OrphanDirInput = {
      novelId: 11,
      hasChapterIndex: false,
      inDb: false,
    };

    expect(classifyDownloadDir(input)).toBe('orphan');
  });

  it('never deletes a directory it cannot identify', () => {
    const input: OrphanDirInput = {
      novelId: null,
      hasChapterIndex: false,
      inDb: false,
    };

    expect(classifyDownloadDir(input)).toBe('keep');
  });
});

describe('scanOrphanDownloads', () => {
  const novelDir = (plugin: string, novel: string) =>
    `${SHARED_NOVELS}/${plugin}/${novel}`;

  beforeEach(() => {
    (getNovelById as jest.Mock).mockReset();
    (getNovelById as jest.Mock).mockImplementation((id: number) =>
      id === 7 ? { id: 7 } : undefined,
    );
    (NativeFile.exists as jest.Mock).mockReset();
    (NativeFile.exists as jest.Mock).mockImplementation(
      (path: string) =>
        path === SHARED_NOVELS || path.endsWith('/9/3/index.html'),
    );
    (NativeFile.readDir as jest.Mock).mockReset();
    (NativeFile.readDir as jest.Mock).mockImplementation((dir: string) => {
      if (dir === SHARED_NOVELS) {
        return [
          { name: 'wtrlab', path: novelDir('wtrlab', ''), isDirectory: true },
        ];
      }
      if (dir === novelDir('wtrlab', '')) {
        return [
          { name: '7', path: novelDir('wtrlab', '7'), isDirectory: true },
          { name: '9', path: novelDir('wtrlab', '9'), isDirectory: true },
          { name: '11', path: novelDir('wtrlab', '11'), isDirectory: true },
          {
            name: 'junk.txt',
            path: `${novelDir('wtrlab', '')}/junk.txt`,
            isDirectory: false,
          },
        ];
      }
      if (dir === novelDir('wtrlab', '7')) {
        return [
          {
            name: 'cover.png',
            path: `${novelDir('wtrlab', '7')}/cover.png`,
            isDirectory: false,
          },
        ];
      }
      if (dir === novelDir('wtrlab', '9')) {
        return [
          {
            name: '3',
            path: `${novelDir('wtrlab', '9')}/3`,
            isDirectory: true,
          },
        ];
      }
      if (dir === novelDir('wtrlab', '9/3')) {
        return [
          {
            name: 'index.html',
            path: `${novelDir('wtrlab', '9')}/3/index.html`,
            isDirectory: false,
          },
        ];
      }
      if (dir === novelDir('wtrlab', '11')) {
        return [
          {
            name: 'cover.png',
            path: `${novelDir('wtrlab', '11')}/cover.png`,
            isDirectory: false,
          },
        ];
      }
      return [];
    });
    (NativeFile.getFileSize as jest.Mock).mockReset();
    (NativeFile.getFileSize as jest.Mock).mockReturnValue(4096);
  });

  it('returns only cover-only directories without a db row', () => {
    expect(scanOrphanDownloads()).toEqual([
      { path: novelDir('wtrlab', '11'), bytes: 4096 },
    ]);
  });

  it('returns an empty list when the novels root is absent', () => {
    (NativeFile.exists as jest.Mock).mockReturnValue(false);
    (NativeFile.readDir as jest.Mock).mockReturnValue([]);

    expect(scanOrphanDownloads()).toEqual([]);
  });
});
