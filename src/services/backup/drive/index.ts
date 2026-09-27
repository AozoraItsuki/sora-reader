import { exists } from '@api/drive';
import { download, updateMetadata, uploadMedia } from '@api/drive/request';
import { DriveFile } from '@api/drive/types';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import { getString } from '@strings/translations';
import { sleep } from '@utils/sleep';

import { ZipBackupName } from '../types';
import { CACHE_DIR_PATH, prepareBackupData, restoreData } from '../utils';

export const createDriveBackup = async (
  backupFolder: DriveFile,
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

  await sleep(500);

  const file = await uploadMedia(CACHE_DIR_PATH);

  await updateMetadata(
    file.id,
    {
      name: ZipBackupName.DATA,
      mimeType: 'application/zip',
      parents: [backupFolder.id],
    },
    file.parents[0],
  );

  setMeta(meta => ({
    ...meta,
    progress: 2 / 2,
    isRunning: false,
  }));
};

export const driveRestore = async (
  backupFolder: DriveFile,
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

  const zipDataFile = await exists(ZipBackupName.DATA, false, backupFolder.id);
  if (!zipDataFile) {
    throw new Error(getString('backupScreen.invalidBackupFolder'));
  }

  await download(zipDataFile, CACHE_DIR_PATH);
  await sleep(500);

  setMeta(meta => ({
    ...meta,
    progress: 1 / 2,
    progressText: getString('backupScreen.restoringData'),
  }));

  await restoreData(CACHE_DIR_PATH);
  await sleep(500);

  setMeta(meta => ({
    ...meta,
    progress: 2 / 2,
    isRunning: false,
  }));
};
