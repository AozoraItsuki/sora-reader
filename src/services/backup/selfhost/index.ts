import { download, upload } from '@api/remote';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import { getString } from '@strings/translations';
import { sleep } from '@utils/sleep';

import { ZipBackupName } from '../types';
import { CACHE_DIR_PATH, prepareBackupData, restoreData } from '../utils';

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
    progress: 0 / 2,
    progressText: getString('backupScreen.preparingData'),
  }));

  await prepareBackupData(CACHE_DIR_PATH);

  setMeta(meta => ({
    ...meta,
    progress: 1 / 2,
    progressText: getString('backupScreen.uploadingData'),
  }));

  await sleep(200);

  await upload(host, backupFolder, ZipBackupName.DATA, CACHE_DIR_PATH);

  setMeta(meta => ({
    ...meta,
    progress: 2 / 2,
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
    progress: 0 / 2,
    progressText: getString('backupScreen.downloadingData'),
  }));

  await download(host, backupFolder, ZipBackupName.DATA, CACHE_DIR_PATH);

  setMeta(meta => ({
    ...meta,
    progress: 1 / 2,
    progressText: getString('backupScreen.restoringData'),
  }));

  await sleep(200);

  await restoreData(CACHE_DIR_PATH);

  setMeta(meta => ({
    ...meta,
    progress: 2 / 2,
    isRunning: false,
  }));
};
