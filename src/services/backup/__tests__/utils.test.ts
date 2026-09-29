import { getAllHistoryRaw } from '@database/queries/HistoryQueries';
import { getAllNovels } from '@database/queries/NovelQueries';
import {
  BACKUP_OPTIONS,
  BackupOptions,
  initialBackupOptions,
} from '@hooks/persisted/useBackupOptions';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';

import { BackupEntryName } from '../types';
import { prepareBackupData, restoreData } from '../utils';

jest.mock('@hooks/persisted', () => ({
  SEARCH_HISTORY_KEY: 'SEARCH_HISTORY_KEY',
}));

jest.mock('@services/ServiceManager', () => ({
  __esModule: true,
  default: { manager: { STORE_KEY: 'STORE_KEY' } },
}));

jest.mock('@utils/showToast', () => ({
  showToast: jest.fn(),
}));

jest.mock('@hooks/persisted/useAIProviders', () => ({
  AI_PROVIDERS_KEY: 'AI_PROVIDERS_KEY',
  getApiKey: jest.fn(async () => ''),
  setApiKey: jest.fn(async () => undefined),
}));

jest.mock('@database/queries/CategoryQueries', () => ({
  getCategoriesFromDb: jest.fn(async () => []),
  getAllNovelCategories: jest.fn(async () => []),
  _restoreCategory: jest.fn(async () => undefined),
  assignOrphanedNovelsToDefaultCategory: jest.fn(async () => undefined),
}));

jest.mock('@database/queries/ChapterQueries', () => ({
  getNovelChapters: jest.fn(async () => []),
}));

jest.mock('@database/queries/HistoryQueries', () => ({
  getAllHistoryRaw: jest.fn(async () => []),
}));

jest.mock('@database/queries/NovelQueries', () => ({
  getAllNovels: jest.fn(async () => [
    { id: 1, name: 'Mock Novel', inLibrary: true, isLocal: false, cover: null },
  ]),
  _restoreNovelAndChapters: jest.fn(async () => undefined),
}));

jest.mock('@database/queries/RepositoryQueries', () => ({
  getRepositoriesFromDb: jest.fn(async () => []),
  _restoreRepository: jest.fn(async () => undefined),
}));

const CACHE_DIR = '/mock/caches/BackupData';

const MOCKED_MODULES = [
  '@database/queries/CategoryQueries',
  '@database/queries/ChapterQueries',
  '@database/queries/HistoryQueries',
  '@database/queries/NovelQueries',
  '@database/queries/RepositoryQueries',
  '@hooks/persisted/useAIProviders',
];

/**
 * `clearMocks` is not inherited by the multi-project jest config, so the module
 * factory mocks have to be reset explicitly between tests.
 */
const clearMockedModules = () => {
  MOCKED_MODULES.forEach(moduleName => {
    const mocked = jest.requireMock(moduleName) as Record<string, unknown>;
    Object.values(mocked).forEach(value => {
      if (jest.isMockFunction(value)) {
        (value as jest.Mock).mockClear();
      }
    });
  });
};

const writeFileMock = NativeFile.writeFile as jest.Mock;
const existsMock = NativeFile.exists as jest.Mock;
const mkdirMock = NativeFile.mkdir as jest.Mock;
const unlinkMock = NativeFile.unlink as jest.Mock;

const clearedPaths = () => unlinkMock.mock.calls.map(call => call[0]);
const createdPaths = () => mkdirMock.mock.calls.map(call => call[0]);

const setOptions = (overrides: Partial<BackupOptions>) => {
  MMKVStorage.set(
    BACKUP_OPTIONS,
    JSON.stringify({ ...initialBackupOptions, ...overrides }),
  );
};

const writtenPaths = () => writeFileMock.mock.calls.map(call => call[0]);

const hasWritten = (entry: BackupEntryName) =>
  writtenPaths().some(path => path === `${CACHE_DIR}/${entry}`);

const hasWrittenNovel = () =>
  writtenPaths().some(path =>
    path.startsWith(`${CACHE_DIR}/${BackupEntryName.NOVEL_AND_CHAPTERS}/`),
  );

describe('prepareBackupData', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    clearMockedModules();
    writeFileMock.mockClear();
    existsMock.mockClear();
    existsMock.mockReturnValue(false);
    mkdirMock.mockClear();
    unlinkMock.mockClear();
    (NativeFile.readFile as jest.Mock).mockClear();
    (NativeFile.copyFile as jest.Mock).mockClear();
    (NativeFile.moveFile as jest.Mock).mockClear();
    (NativeFile.downloadFile as jest.Mock).mockClear();
    (NativeFile.getFileSize as jest.Mock).mockClear();
  });

  it('writes every section when no preference was stored', async () => {
    await prepareBackupData(CACHE_DIR);

    expect(hasWritten(BackupEntryName.VERSION)).toBe(true);
    expect(hasWrittenNovel()).toBe(true);
    expect(hasWritten(BackupEntryName.CATEGORY)).toBe(true);
    expect(hasWritten(BackupEntryName.REPOSITORY)).toBe(true);
    expect(hasWritten(BackupEntryName.SETTING)).toBe(true);
    expect(createdPaths()).toEqual([
      CACHE_DIR,
      `${CACHE_DIR}/${BackupEntryName.NOVEL_AND_CHAPTERS}`,
    ]);
  });

  it('skips the novels section when it is disabled', async () => {
    setOptions({ backupNovels: false });

    await prepareBackupData(CACHE_DIR);

    expect(hasWrittenNovel()).toBe(false);
    expect(hasWritten(BackupEntryName.CATEGORY)).toBe(true);
    expect(hasWritten(BackupEntryName.REPOSITORY)).toBe(true);
    expect(hasWritten(BackupEntryName.SETTING)).toBe(true);
  });

  it('skips the categories section when it is disabled', async () => {
    setOptions({ backupCategories: false });

    await prepareBackupData(CACHE_DIR);

    expect(hasWritten(BackupEntryName.CATEGORY)).toBe(false);
    expect(hasWrittenNovel()).toBe(true);
  });

  it('skips the repositories section when it is disabled', async () => {
    setOptions({ backupRepositories: false });

    await prepareBackupData(CACHE_DIR);

    expect(hasWritten(BackupEntryName.REPOSITORY)).toBe(false);
    expect(hasWritten(BackupEntryName.CATEGORY)).toBe(true);
  });

  it('backs up installed plugin files with the repositories section', async () => {
    // Key mirrors INSTALLED_PLUGINS from usePlugins without pulling the
    // plugin runtime into this suite.
    MMKVStorage.set(
      'INSTALL_PLUGINS',
      JSON.stringify([{ id: 'WTRLAB', name: 'WTR-LAB' }]),
    );
    existsMock.mockImplementation(
      (path: string) => path === '/mock/external/Plugins/WTRLAB/index.js',
    );

    await prepareBackupData(CACHE_DIR);

    expect(NativeFile.copyFile).toHaveBeenCalledWith(
      '/mock/external/Plugins/WTRLAB/index.js',
      `${CACHE_DIR}/${BackupEntryName.PLUGINS}/WTRLAB/index.js`,
    );
    expect(createdPaths()).toContain(
      `${CACHE_DIR}/${BackupEntryName.PLUGINS}/WTRLAB`,
    );
  });

  it('skips plugin files when the repositories section is disabled', async () => {
    setOptions({ backupRepositories: false });
    MMKVStorage.set(
      'INSTALL_PLUGINS',
      JSON.stringify([{ id: 'WTRLAB', name: 'WTR-LAB' }]),
    );

    await prepareBackupData(CACHE_DIR);

    expect(NativeFile.copyFile).not.toHaveBeenCalled();
  });

  it('skips the settings section when it is disabled', async () => {
    setOptions({ backupSettings: false });

    await prepareBackupData(CACHE_DIR);

    expect(hasWritten(BackupEntryName.SETTING)).toBe(false);
    expect(hasWritten(BackupEntryName.REPOSITORY)).toBe(true);
  });

  it('only writes the version file when every data section is disabled', async () => {
    setOptions({
      backupNovels: false,
      backupCategories: false,
      backupRepositories: false,
      backupSettings: false,
    });

    await prepareBackupData(CACHE_DIR);

    expect(writtenPaths()).toEqual([`${CACHE_DIR}/${BackupEntryName.VERSION}`]);
  });

  it('still backs up API keys independently of the data sections', async () => {
    setOptions({ backupSettings: false });
    MMKVStorage.set(
      'APP_SETTINGS',
      JSON.stringify({ backupApiKeys: true, verboseLogging: false }),
    );
    MMKVStorage.set(
      'AI_PROVIDERS_KEY',
      JSON.stringify([{ id: 'openai', name: 'OpenAI' }]),
    );
    const { getApiKey } = jest.requireMock('@hooks/persisted/useAIProviders');
    getApiKey.mockResolvedValue('secret-key');

    await prepareBackupData(CACHE_DIR);

    expect(hasWritten(BackupEntryName.SETTING)).toBe(false);
    expect(hasWritten(BackupEntryName.API_KEYS)).toBe(true);
    expect(
      writeFileMock.mock.calls.find(
        call => call[0] === `${CACHE_DIR}/${BackupEntryName.API_KEYS}`,
      )?.[1],
    ).toBe(JSON.stringify({ openai: 'secret-key' }));
  });

  it('does not create the novel directory when novels are disabled', async () => {
    setOptions({ backupNovels: false });

    await prepareBackupData(CACHE_DIR);

    expect(createdPaths()).toEqual([CACHE_DIR]);
  });

  it('drops entries left over by a previous backup', async () => {
    setOptions({
      backupNovels: false,
      backupCategories: false,
      backupRepositories: false,
      backupSettings: false,
    });
    // Everything is still on disk from the previous run
    existsMock.mockReturnValue(true);

    await prepareBackupData(CACHE_DIR);

    expect(clearedPaths()).toEqual([
      `${CACHE_DIR}/${BackupEntryName.NOVEL_AND_CHAPTERS}`,
      `${CACHE_DIR}/${BackupEntryName.CATEGORY}`,
      `${CACHE_DIR}/${BackupEntryName.REPOSITORY}`,
      `${CACHE_DIR}/${BackupEntryName.PLUGINS}`,
      `${CACHE_DIR}/${BackupEntryName.SETTING}`,
      `${CACHE_DIR}/${BackupEntryName.API_KEYS}`,
    ]);
  });

  it('does not read the database for disabled sections', async () => {
    setOptions({
      backupNovels: false,
      backupCategories: false,
      backupRepositories: false,
    });

    await prepareBackupData(CACHE_DIR);

    expect(getAllNovels).not.toHaveBeenCalled();
    expect(getAllHistoryRaw).not.toHaveBeenCalled();
  });

  it('keeps every byte it produces inside the prepared data directory', async () => {
    await prepareBackupData(CACHE_DIR);

    // The only inputs are DB rows and MMKV, so the only output is the archive
    // directory — a chapter blob could only appear if a tree path was written.
    expect(writtenPaths().length).toBeGreaterThan(0);
    writtenPaths().forEach(path => {
      expect(path.startsWith(`${CACHE_DIR}/`)).toBe(true);
    });
    createdPaths().forEach(path => {
      expect(path.startsWith(CACHE_DIR)).toBe(true);
    });
  });

  it('never reads, copies or moves a file out of the novels tree', async () => {
    await prepareBackupData(CACHE_DIR);

    // Chapter content is re-downloadable: backing it up would have to pull the
    // bytes, and no filesystem read of library content happens here.
    expect(NativeFile.readFile).not.toHaveBeenCalled();
    expect(NativeFile.copyFile).not.toHaveBeenCalled();
    expect(NativeFile.moveFile).not.toHaveBeenCalled();
    expect(NativeFile.downloadFile).not.toHaveBeenCalled();
    expect(NativeFile.getFileSize).not.toHaveBeenCalled();
  });

  it('records a cover as a path string and keeps no cover bytes', async () => {
    const { getAllNovels: novelsQuery } = jest.requireMock(
      '@database/queries/NovelQueries',
    );
    novelsQuery.mockResolvedValue([
      {
        id: 1,
        name: 'Mock Novel',
        inLibrary: true,
        isLocal: false,
        cover: 'Novels/local/1/cover.png?cache=1',
      },
    ]);
    const { getNovelChapters } = jest.requireMock(
      '@database/queries/ChapterQueries',
    );
    getNovelChapters.mockResolvedValue([
      {
        id: 10,
        novelId: 1,
        name: 'Chapter 1',
        path: 'Novels/local/1/10/index.html',
        isDownloaded: true,
      },
    ]);

    await prepareBackupData(CACHE_DIR);

    const payload = JSON.parse(
      writeFileMock.mock.calls.find(call =>
        call[0].startsWith(
          `${CACHE_DIR}/${BackupEntryName.NOVEL_AND_CHAPTERS}/`,
        ),
      )?.[1] as string,
    );

    // References only: the tree path survives so a restore can find the file,
    // the cache-buster is dropped, and the html itself is not embedded.
    expect(payload.cover).toBe('Novels/local/1/cover.png');
    expect(payload.chapters).toEqual([
      expect.objectContaining({
        id: 10,
        path: 'Novels/local/1/10/index.html',
        readDuration: 0,
      }),
    ]);
    expect(JSON.stringify(payload)).not.toContain('<html');
    expect(NativeFile.readFile).not.toHaveBeenCalled();
  });
});

describe('restoreData with missing sections', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    clearMockedModules();
    existsMock.mockClear();
    existsMock.mockReturnValue(false);
    (showToast as jest.Mock).mockClear();
    (NativeFile.readDir as jest.Mock).mockClear();
    (NativeFile.readFile as jest.Mock).mockClear();
    (NativeFile.readFile as jest.Mock).mockReturnValue('');
  });

  it('does not crash and reports every missing file', async () => {
    await expect(restoreData(CACHE_DIR)).resolves.toBeUndefined();

    const messages = (showToast as jest.Mock).mock.calls.map(call => call[0]);
    expect(messages).toContain(
      getString('backupScreen.novelDirectoryNotFound'),
    );
    expect(messages).toContain(getString('backupScreen.categoryFileNotFound'));
    expect(messages).toContain(
      getString('backupScreen.repositoryFileNotFound'),
    );
    expect(messages).toContain(getString('backupScreen.settingsFileNotFound'));
  });

  it('restores only the sections that exist in the backup', async () => {
    existsMock.mockImplementation((path: string) => {
      return path === `${CACHE_DIR}/${BackupEntryName.CATEGORY}`;
    });
    (NativeFile.readFile as jest.Mock).mockReturnValue(
      JSON.stringify([{ id: 3, name: 'Kept', novelIds: [] }]),
    );
    const { _restoreCategory, assignOrphanedNovelsToDefaultCategory } =
      jest.requireMock('@database/queries/CategoryQueries');
    const { _restoreNovelAndChapters } = jest.requireMock(
      '@database/queries/NovelQueries',
    );

    await restoreData(CACHE_DIR);

    expect(_restoreCategory).toHaveBeenCalledTimes(1);
    expect(_restoreNovelAndChapters).not.toHaveBeenCalled();
    expect(assignOrphanedNovelsToDefaultCategory).toHaveBeenCalledTimes(1);
  });

  it('restores backed-up plugin files into plugin storage', async () => {
    const copyFileMock = NativeFile.copyFile as jest.Mock;
    const mkdirMockLocal = NativeFile.mkdir as jest.Mock;
    copyFileMock.mockClear();
    mkdirMockLocal.mockClear();
    const pluginsDir = `${CACHE_DIR}/${BackupEntryName.PLUGINS}`;
    existsMock.mockImplementation((path: string) => path === pluginsDir);
    (NativeFile.readDir as jest.Mock).mockImplementation((dir: string) => {
      if (dir === pluginsDir) {
        return [
          { name: 'WTRLAB', path: `${pluginsDir}/WTRLAB`, isDirectory: true },
        ];
      }
      return [
        {
          name: 'index.js',
          path: `${pluginsDir}/WTRLAB/index.js`,
          isDirectory: false,
        },
      ];
    });

    await restoreData(CACHE_DIR);

    expect(copyFileMock).toHaveBeenCalledWith(
      `${pluginsDir}/WTRLAB/index.js`,
      '/mock/external/Plugins/WTRLAB/index.js',
    );
  });
});
