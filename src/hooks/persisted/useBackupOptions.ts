import { MMKVStorage } from '@utils/mmkv/mmkv';
import { useCallback, useMemo } from 'react';
import { useMMKVObject } from 'react-native-mmkv';

export const BACKUP_OPTIONS = 'BACKUP_OPTIONS';

export interface BackupOptions {
  /**
   * Novels and their chapters (NovelAndChapters/*.json)
   */
  backupNovels: boolean;
  /**
   * Novel categories (Category.json)
   */
  backupCategories: boolean;
  /**
   * Plugin repositories (Repository.json)
   */
  backupRepositories: boolean;
  /**
   * App settings (Setting.json)
   */
  backupSettings: boolean;
}

/**
 * Everything is backed up by default, so existing users see no behavior change.
 *
 * API keys are not part of this: they are still gated by
 * `AppSettings.backupApiKeys` in the AI settings screen.
 */
export const initialBackupOptions: BackupOptions = {
  backupNovels: true,
  backupCategories: true,
  backupRepositories: true,
  backupSettings: true,
};

/**
 * Non-reactive read of the persisted backup options.
 * Used by the backup creators, which are not React components.
 */
export const getBackupOptions = (): BackupOptions => {
  const stored = MMKVStorage.getString(BACKUP_OPTIONS);
  if (!stored) {
    return { ...initialBackupOptions };
  }
  try {
    const parsed = JSON.parse(stored) as Partial<BackupOptions>;
    return { ...initialBackupOptions, ...parsed };
  } catch (error) {
    console.warn('[BackupOptions] Failed to parse stored options', error);
    return { ...initialBackupOptions };
  }
};

export const useBackupOptions = () => {
  const [backupOptions = initialBackupOptions, setOptions] =
    useMMKVObject<BackupOptions>(BACKUP_OPTIONS);

  const setBackupOptions = useCallback(
    (values: Partial<BackupOptions>) =>
      setOptions(prev => ({ ...initialBackupOptions, ...prev, ...values })),
    [setOptions],
  );

  return useMemo(
    () => ({
      ...initialBackupOptions,
      ...backupOptions,
      setBackupOptions,
    }),
    [backupOptions, setBackupOptions],
  );
};
