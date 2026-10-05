import {
  _restoreCategory,
  assignOrphanedNovelsToDefaultCategory,
  getAllNovelCategories,
  getCategoriesFromDb,
} from '@database/queries/CategoryQueries';
import { getNovelChapters } from '@database/queries/ChapterQueries';
import { getAllHistoryRaw } from '@database/queries/HistoryQueries';
import {
  _restoreNovelAndChapters,
  getAllNovels,
} from '@database/queries/NovelQueries';
import {
  _restoreRepository,
  getRepositoriesFromDb,
} from '@database/queries/RepositoryQueries';
import { RepositoryRow } from '@database/schema';
import { BackupCategory, BackupNovel } from '@database/types';
import { SEARCH_HISTORY_KEY } from '@hooks/persisted';
import {
  AI_PROVIDERS_KEY,
  getApiKey,
  setApiKey,
} from '@hooks/persisted/useAIProviders';
import { getBackupOptions } from '@hooks/persisted/useBackupOptions';
import { DISABLED_REPOSITORIES } from '@hooks/persisted/useDisabledRepositories';
import { INSTALLED_PLUGINS } from '@hooks/persisted/usePlugins';
import { SELF_HOST_BACKUP } from '@hooks/persisted/useSelfHost';
import { APP_SETTINGS, AppSettings } from '@hooks/persisted/useSettings';
import {
  LAST_UPDATE_TIME,
  NOVEL_UPDATE_RANDOM_KEY,
} from '@hooks/persisted/useUpdates';
import { CUSTOM_USER_AGENT } from '@hooks/persisted/useUserAgent';
import { PluginItem } from '@plugins/types';
import DebugLogService from '@services/DebugLogService';
import ServiceManager from '@services/ServiceManager';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import { getMMKVObject, MMKVStorage } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import { PLUGIN_STORAGE, ROOT_STORAGE } from '@utils/Storages';

import { version } from '../../../package.json';
import { BackupEntryName } from './types';

const BTAG = '[Backup]';

const APP_STORAGE_URI = 'file://' + ROOT_STORAGE;

/**
 * Novel covers are stored in the DB as SAF-tree-relative paths
 * (`Novels/{pluginId}/{novelId}/cover.png`), with an optional `?cacheBuster`
 * query param. Backups keep them verbatim.
 */
const stripCoverCacheBuster = (cover: string) => cover.split('?')[0];

export const CACHE_DIR_PATH =
  NativeFile.getConstants().ExternalCachesDirectoryPath + '/BackupData';

const removeIfExists = (path: string) => {
  if (NativeFile.exists(path)) {
    NativeFile.unlink(path);
  }
};

const backupMMKVData = () => {
  const excludeKeys = [
    ServiceManager.manager.STORE_KEY,
    'TRACKED_NOVEL_PREFIX',
    SELF_HOST_BACKUP,
    LAST_UPDATE_TIME,
    NOVEL_UPDATE_RANDOM_KEY,
    SEARCH_HISTORY_KEY,
    DISABLED_REPOSITORIES,
    CUSTOM_USER_AGENT,
  ];
  const keys = MMKVStorage.getAllKeys().filter(
    key => !excludeKeys.includes(key),
  );
  const data = {} as any;
  for (const key of keys) {
    let value: number | string | boolean | undefined =
      MMKVStorage.getString(key);
    if (!value) {
      value = MMKVStorage.getBoolean(key);
    }
    if (key && value) {
      data[key] = value;
    }
  }
  return data;
};

const restoreMMKVData = (data: any) => {
  for (const key in data) {
    MMKVStorage.set(key, data[key]);
  }
};

export const prepareBackupData = async (cacheDirPath: string) => {
  const options = getBackupOptions();
  DebugLogService.addEntry(
    'log',
    `${BTAG} Backup options: ${JSON.stringify(options)}`,
  );

  const novelDirPath = cacheDirPath + '/' + BackupEntryName.NOVEL_AND_CHAPTERS;
  NativeFile.mkdir(cacheDirPath);

  // The data archive is built from cacheDirPath, so anything left over from a
  // previous backup (including a previous downloaded-files archive) must be
  // dropped, otherwise a disabled section would still end up in the archive.
  removeIfExists(novelDirPath);
  removeIfExists(cacheDirPath + '/' + BackupEntryName.CATEGORY);
  removeIfExists(cacheDirPath + '/' + BackupEntryName.REPOSITORY);
  removeIfExists(cacheDirPath + '/' + BackupEntryName.PLUGINS);
  removeIfExists(cacheDirPath + '/' + BackupEntryName.SETTING);
  removeIfExists(cacheDirPath + '/' + BackupEntryName.API_KEYS);

  // version
  try {
    DebugLogService.addEntry('log', `${BTAG} Writing version info...`);
    NativeFile.writeFile(
      cacheDirPath + '/' + BackupEntryName.VERSION,
      JSON.stringify({ version: version }),
    );
  } catch (error: any) {
    showToast(
      getString('backupScreen.versionFileWriteFailed', {
        error: error?.message || String(error),
      }),
    );
    throw error;
  }

  // novels
  if (!options.backupNovels) {
    DebugLogService.addEntry('log', `${BTAG} Skipping novels backup`);
  } else {
    DebugLogService.addEntry('log', `${BTAG} Backing up novels...`);
    NativeFile.mkdir(novelDirPath);
    // Query all history
    const allHistory = await getAllHistoryRaw();
    // Convert history to a map of chapterId to history entry
    const historyMap = new Map<number, number>();
    allHistory.forEach(entry => {
      historyMap.set(entry.chapterId, entry.readDuration);
    });
    await getAllNovels().then(async novels => {
      DebugLogService.addEntry(
        'log',
        `${BTAG} Found ${novels.length} novels to backup`,
      );
      for (let i_ = 0; i_ < novels.length; i_++) {
        const novel = novels[i_];
        try {
          if (!novel.inLibrary && !novel.isLocal) {
            DebugLogService.addEntry(
              'log',
              `${BTAG} Skipping novel not in library and not local: ${novel.name}`,
            );
            continue;
          }
          const chapters = await getNovelChapters(novel.id);
          // Attach readDuration to chapters
          const backupChapters = chapters.map(chapter => ({
            ...chapter,
            readDuration: historyMap.get(chapter.id) || 0,
          }));
          DebugLogService.addEntry(
            'log',
            `${BTAG} [${i_ + 1}/${novels.length}] Processing novel: ${
              novel.name
            } (${chapters.length} chapters)`,
          );
          NativeFile.writeFile(
            novelDirPath + '/' + novel.id + '.json',
            JSON.stringify({
              chapters: backupChapters,
              ...novel,
              // Covers are SAF-tree-relative; drop only the cache-buster.
              cover: novel.cover
                ? stripCoverCacheBuster(novel.cover)
                : novel.cover,
            }),
          );
        } catch (error: any) {
          showToast(
            getString('backupScreen.novelBackupFailed', {
              novelName: novel.name,
              error: error?.message,
            }),
          );
        }
      }
    });
  }

  // categories
  if (!options.backupCategories) {
    DebugLogService.addEntry('log', `${BTAG} Skipping categories backup`);
  } else {
    try {
      DebugLogService.addEntry('log', `${BTAG} Backing up categories...`);
      const categories = await getCategoriesFromDb();
      const novelCategories = await getAllNovelCategories();
      DebugLogService.addEntry(
        'log',
        `${BTAG} Found ${categories.length} categories`,
      );
      NativeFile.writeFile(
        cacheDirPath + '/' + BackupEntryName.CATEGORY,
        JSON.stringify(
          categories.map(category => {
            return {
              ...category,
              novelIds: novelCategories
                .filter(nc => nc.categoryId === category.id)
                .map(nc => nc.novelId),
            };
          }),
        ),
      );
    } catch (error: any) {
      showToast(
        getString('backupScreen.categoryFileWriteFailed', {
          error: error?.message || String(error),
        }),
      );
    }
  }

  // repositories
  if (!options.backupRepositories) {
    DebugLogService.addEntry('log', `${BTAG} Skipping repositories backup`);
  } else {
    try {
      DebugLogService.addEntry('log', `${BTAG} Backing up repositories...`);
      const repositories = await getRepositoriesFromDb();
      NativeFile.writeFile(
        cacheDirPath + '/' + BackupEntryName.REPOSITORY,
        JSON.stringify(repositories),
      );
      // Installed plugin code lives outside the database: without these files
      // a restored novel dangles as "Unknown plugin". They are tiny text
      // files (not downloads), so they travel with the repositories section.
      const pluginsDirPath = cacheDirPath + '/' + BackupEntryName.PLUGINS;
      const installedPlugins =
        getMMKVObject<PluginItem[]>(INSTALLED_PLUGINS) ?? [];
      const PLUGIN_FILES = ['index.js', 'custom.js', 'custom.css'];
      let backedUpPluginFiles = 0;
      for (const plugin of installedPlugins) {
        for (const file of PLUGIN_FILES) {
          const sourcePath = `${PLUGIN_STORAGE}/${plugin.id}/${file}`;
          try {
            if (NativeFile.exists(sourcePath)) {
              NativeFile.mkdir(`${pluginsDirPath}/${plugin.id}`);
              NativeFile.copyFile(
                sourcePath,
                `${pluginsDirPath}/${plugin.id}/${file}`,
              );
              backedUpPluginFiles++;
            }
          } catch (error) {
            DebugLogService.addEntry(
              'log',
              `${BTAG} Skipping plugin file ${sourcePath}: ${
                (error as Error)?.message ?? String(error)
              }`,
            );
          }
        }
      }
      DebugLogService.addEntry(
        'log',
        `${BTAG} Backed up ${backedUpPluginFiles} plugin files.`,
      );
    } catch (error: any) {
      showToast(
        getString('backupScreen.repositoryFileWriteFailed', {
          error: error?.message || String(error),
        }),
      );
    }
  }

  // settings
  if (!options.backupSettings) {
    DebugLogService.addEntry('log', `${BTAG} Skipping settings backup`);
  } else {
    try {
      DebugLogService.addEntry('log', `${BTAG} Backing up settings...`);
      NativeFile.writeFile(
        cacheDirPath + '/' + BackupEntryName.SETTING,
        JSON.stringify(backupMMKVData()),
      );
    } catch (error: any) {
      showToast(
        getString('backupScreen.settingsFileWriteFailed', {
          error: error?.message || String(error),
        }),
      );
    }
  }

  // API Keys
  try {
    DebugLogService.addEntry(
      'log',
      `${BTAG} Checking API keys backup preference...`,
    );
    const appSettingsString = MMKVStorage.getString(APP_SETTINGS);
    const appSettings: AppSettings | undefined = appSettingsString
      ? JSON.parse(appSettingsString)
      : undefined;

    if (appSettings?.backupApiKeys) {
      DebugLogService.addEntry('log', `${BTAG} Backing up API keys...`);
      const aiProvidersString = MMKVStorage.getString(AI_PROVIDERS_KEY);
      if (aiProvidersString) {
        const providers = JSON.parse(aiProvidersString);
        const apiKeysBackup: Record<string, string> = {};

        for (const provider of providers) {
          if (provider.id) {
            const key = await getApiKey(provider.id);
            if (key) {
              apiKeysBackup[provider.id] = key;
            }
          }
        }

        if (Object.keys(apiKeysBackup).length > 0) {
          NativeFile.writeFile(
            cacheDirPath + '/' + BackupEntryName.API_KEYS,
            JSON.stringify(apiKeysBackup),
          );
        }
      }
    }
  } catch (error: any) {
    showToast(
      getString('backupScreen.apiKeysFileWriteFailed', {
        error: error?.message || String(error),
      }),
    );
  }
};

export const restoreData = async (cacheDirPath: string) => {
  const novelDirPath = cacheDirPath + '/' + BackupEntryName.NOVEL_AND_CHAPTERS;

  try {
    // version
    // nothing to do

    // novels
    showToast(getString('backupScreen.restoringNovels'));
    let novelCount = 0;
    let failedCount = 0;

    if (!NativeFile.exists(novelDirPath)) {
      showToast(getString('backupScreen.novelDirectoryNotFound'));
    } else {
      try {
        const items = NativeFile.readDir(novelDirPath);
        DebugLogService.addEntry(
          'log',
          `${BTAG} Found ${items.length} novels to restore`,
        );
        for (let i_ = 0; i_ < items.length; i_++) {
          const item = items[i_];
          if (!item.isDirectory) {
            try {
              const fileContent = NativeFile.readFile(item.path);
              const backupNovel = JSON.parse(fileContent) as BackupNovel;
              DebugLogService.addEntry(
                'log',
                `${BTAG} [${i_ + 1}/${items.length}] Processing novel: ${
                  backupNovel.name
                } (${backupNovel.chapters.length} chapters)`,
              );

              if (
                backupNovel.cover &&
                !backupNovel.cover.startsWith('http') &&
                !backupNovel.cover.startsWith('Novels/')
              ) {
                // Legacy absolute app-storage cover: normalize to a tree-relative
                // path. Already-relative covers are kept as-is.
                backupNovel.cover = backupNovel.cover.replace(
                  APP_STORAGE_URI + '/Novels/',
                  'Novels/',
                );
              }

              await _restoreNovelAndChapters(backupNovel);
              novelCount++;
            } catch (error: any) {
              failedCount++;
              const novelName =
                item.path.split('/').pop()?.replace('.json', '') || 'Unknown';
              showToast(
                getString('backupScreen.novelRestoreFailed', {
                  novelName: novelName,
                  error: error?.message || String(error),
                }),
              );
            }
          }
        }
      } catch (error: any) {
        showToast(
          getString('backupScreen.novelDirectoryReadFailed', {
            error: error?.message || String(error),
          }),
        );
      }
    }
    if (failedCount > 0) {
      showToast(
        getString('backupScreen.novelsRestoredWithErrors', {
          count: novelCount,
          failedCount: failedCount,
        }),
      );
    } else {
      showToast(
        getString('backupScreen.novelsRestored', { count: novelCount }),
      );
    }

    // categories
    showToast(getString('backupScreen.restoringCategories'));
    const categoryFilePath = cacheDirPath + '/' + BackupEntryName.CATEGORY;
    let categoryCount = 0;
    let failedCategoryCount = 0;

    if (!NativeFile.exists(categoryFilePath)) {
      showToast(getString('backupScreen.categoryFileNotFound'));
    } else {
      try {
        const fileContent = NativeFile.readFile(categoryFilePath);
        const categories: BackupCategory[] = JSON.parse(fileContent);
        DebugLogService.addEntry(
          'log',
          `${BTAG} Found ${categories.length} categories to restore`,
        );

        for (const category of categories) {
          try {
            DebugLogService.addEntry(
              'log',
              `${BTAG} Restoring category: ${category.name} (${category.id})`,
            );
            await _restoreCategory(category);
            categoryCount++;
          } catch (error: any) {
            failedCategoryCount++;
            showToast(
              getString('backupScreen.categoryRestoreFailed', {
                categoryName: category.name || category.id.toString(),
                error: error?.message || String(error),
              }),
            );
          }
        }
      } catch (error: any) {
        showToast(
          getString('backupScreen.categoryFileReadFailed', {
            error: error?.message || String(error),
          }),
        );
      }
    }
    if (failedCategoryCount > 0) {
      showToast(
        getString('backupScreen.categoriesRestoredWithErrors', {
          count: categoryCount,
          failedCount: failedCategoryCount,
        }),
      );
    } else {
      showToast(
        getString('backupScreen.categoriesRestored', {
          count: categoryCount,
        }),
      );
    }

    // repositories
    showToast(getString('backupScreen.restoringRepositories'));
    const repositoryFilePath = cacheDirPath + '/' + BackupEntryName.REPOSITORY;

    if (!NativeFile.exists(repositoryFilePath)) {
      showToast(getString('backupScreen.repositoryFileNotFound'));
    } else {
      try {
        const fileContent = NativeFile.readFile(repositoryFilePath);
        const repositories: RepositoryRow[] = JSON.parse(fileContent);
        DebugLogService.addEntry(
          'log',
          `${BTAG} Found ${repositories.length} repositories to restore`,
        );

        for (const repository of repositories) {
          try {
            await _restoreRepository(repository);
          } catch (error: any) {
            showToast(
              getString('backupScreen.repositoryRestoreFailed', {
                repositoryUrl: repository.url,
                error: error?.message || String(error),
              }),
            );
          }
        }
      } catch (error: any) {
        showToast(
          getString('backupScreen.repositoryFileReadFailed', {
            error: error?.message || String(error),
          }),
        );
      }
    }

    // Installed plugin code saved alongside the repositories section: copy
    // it back so restored novels resolve instead of dangling as unknown.
    const backupPluginsDirPath = cacheDirPath + '/' + BackupEntryName.PLUGINS;
    if (NativeFile.exists(backupPluginsDirPath)) {
      try {
        const pluginDirs = NativeFile.readDir(backupPluginsDirPath) ?? [];
        for (const pluginDir of pluginDirs) {
          if (!pluginDir.isDirectory) {
            continue;
          }
          NativeFile.mkdir(`${PLUGIN_STORAGE}/${pluginDir.name}`);
          const pluginFiles = NativeFile.readDir(pluginDir.path) ?? [];
          for (const pluginFile of pluginFiles) {
            if (!pluginFile.isDirectory) {
              NativeFile.copyFile(
                pluginFile.path,
                `${PLUGIN_STORAGE}/${pluginDir.name}/${pluginFile.name}`,
              );
            }
          }
        }
      } catch (error: any) {
        showToast(
          getString('backupScreen.pluginRestoreFailed', {
            error: error?.message || String(error),
          }),
        );
      }
    }

    // settings
    showToast(getString('backupScreen.restoringSettings'));
    const settingsFilePath = cacheDirPath + '/' + BackupEntryName.SETTING;

    if (!NativeFile.exists(settingsFilePath)) {
      showToast(getString('backupScreen.settingsFileNotFound'));
    } else {
      try {
        const fileContent = NativeFile.readFile(settingsFilePath);
        const settingsData = JSON.parse(fileContent);
        restoreMMKVData(settingsData);
        showToast(getString('backupScreen.settingsRestored'));
      } catch (error: any) {
        showToast(
          getString('backupScreen.settingsRestoreFailed', {
            error: error?.message || String(error),
          }),
        );
      }
    }
    showToast(getString('backupScreen.finishingRestore'));

    // API Keys
    const apiKeysFilePath = cacheDirPath + '/' + BackupEntryName.API_KEYS;
    if (NativeFile.exists(apiKeysFilePath)) {
      showToast(getString('backupScreen.restoringApiKeys'));
      try {
        const fileContent = NativeFile.readFile(apiKeysFilePath);
        const apiKeysData: Record<string, string> = JSON.parse(fileContent);

        // Only restore API keys for existing providers
        const aiProvidersString = MMKVStorage.getString(AI_PROVIDERS_KEY);
        const providers = aiProvidersString
          ? JSON.parse(aiProvidersString)
          : [];
        const providerIds = new Set(providers.map((p: any) => p.id));

        for (const [id, key] of Object.entries(apiKeysData)) {
          if (providerIds.has(id)) {
            await setApiKey(id, key);
          }
        }
        DebugLogService.addEntry('log', `${BTAG} API keys restored`);
      } catch (error: any) {
        showToast(
          getString('backupScreen.apiKeysRestoreFailed', {
            error: error?.message || String(error),
          }),
        );
      }
    }

    // Assign orphaned novels to default category
    DebugLogService.addEntry('log', `${BTAG} Assigning orphaned novels`);
    await assignOrphanedNovelsToDefaultCategory();
  } catch (e: any) {
    DebugLogService.addEntry(
      'error',
      `${BTAG} Error during restoreData: ${e.message}`,
    );
  } finally {
    //
  }
};
