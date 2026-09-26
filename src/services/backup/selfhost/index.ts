import { download, upload } from '@api/remote';
import { getBackupOptions } from '@hooks/persisted/useBackupOptions';
import DebugLogService from '@services/DebugLogService';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import { getString } from '@strings/translations';
import { sleep } from '@utils/sleep';
import { ROOT_STORAGE } from '@utils/Storages';

import { ZipBackupName } from '../types';
import { CACHE_DIR_PATH, prepareBackupData, restoreData } from '../utils';

const BTAG = '[Backup]';

export interface SelfHostData {
  host: string;
  backupFolder: string;
}

export const createSelfHostBackup = async (
  { host, backupFolder }: SelfHostData,
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
    progress: 0 / 3,
    progressText: getString('backupScreen.preparingData'),
  }));

  await prepareBackupData(CACHE_DIR_PATH);

  setMeta(meta => ({
    ...meta,
    progress: 1 / 3,
    progressText: getString('backupScreen.uploadingData'),
  }));

  await sleep(200);

  await upload(host, backupFolder, ZipBackupName.DATA, CACHE_DIR_PATH);

  if (getBackupOptions().backupDownloadedFiles) {
    setMeta(meta => ({
      ...meta,
      progress: 2 / 3,
      progressText: getString('backupScreen.uploadingDownloadedFiles'),
    }));

    await sleep(200);

    await upload(host, backupFolder, ZipBackupName.DOWNLOAD, ROOT_STORAGE);
  } else {
    DebugLogService.addEntry(
      'log',
      `${BTAG} Skipping downloaded files (disabled in backup settings)`,
    );
  }

  setMeta(meta => ({
    ...meta,
    progress: 3 / 3,
    isRunning: false,
  }));
};

export const selfHostRestore = async (
  { host, backupFolder }: SelfHostData,
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
    progress: 0 / 3,
    progressText: getString('backupScreen.downloadingData'),
  }));

  await download(host, backupFolder, ZipBackupName.DATA, CACHE_DIR_PATH);

  setMeta(meta => ({
    ...meta,
    progress: 1 / 3,
    progressText: getString('backupScreen.restoringData'),
  }));

  await sleep(200);

  await restoreData(CACHE_DIR_PATH);

  setMeta(meta => ({
    ...meta,
    progress: 2 / 3,
    progressText: getString('backupScreen.downloadingDownloadedFiles'),
  }));

  await sleep(200);

  await download(host, backupFolder, ZipBackupName.DOWNLOAD, ROOT_STORAGE);

  setMeta(meta => ({
    ...meta,
    progress: 3 / 3,
    isRunning: false,
  }));
};
