import { uploadMedia } from '@api/drive/request';
import { DriveFile } from '@api/drive/types';
import { upload } from '@api/remote';
import {
  BACKUP_OPTIONS,
  BackupOptions,
  initialBackupOptions,
} from '@hooks/persisted/useBackupOptions';
import { saveDocuments } from '@react-native-documents/picker';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import NativeZipArchive from '@specs/NativeZipArchive';
import { getString } from '@strings/translations';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { ROOT_STORAGE } from '@utils/Storages';

import { createDriveBackup } from '../drive';
import { createBackup } from '../local';
import { createSelfHostBackup } from '../selfhost';
import { CACHE_DIR_PATH } from '../utils';

jest.mock('../utils', () => ({
  CACHE_DIR_PATH: '/mock/caches/BackupData',
  prepareBackupData: jest.fn(async () => undefined),
  restoreData: jest.fn(async () => undefined),
}));

jest.mock('@api/drive/request', () => ({
  uploadMedia: jest.fn(async () => ({ id: 'file-id', parents: ['parent-id'] })),
  updateMetadata: jest.fn(async () => undefined),
  download: jest.fn(async () => undefined),
}));

jest.mock('@api/remote', () => ({
  upload: jest.fn(async () => undefined),
  download: jest.fn(async () => undefined),
}));

jest.mock('@utils/showToast', () => ({
  showToast: jest.fn(),
}));

const backupFolder = { id: 'folder-id' } as DriveFile;

const setOptions = (overrides: Partial<BackupOptions>) => {
  MMKVStorage.set(
    BACKUP_OPTIONS,
    JSON.stringify({ ...initialBackupOptions, ...overrides }),
  );
};

const createMetaRecorder = () => {
  const states: BackgroundTaskMetadata[] = [];
  let meta: BackgroundTaskMetadata = {
    name: 'TEST',
    isRunning: false,
    progress: 0,
    progressText: undefined,
  };

  const setMeta = (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => {
    meta = transformer(meta);
    states.push(meta);
  };

  return { states, setMeta };
};

const progresses = (states: BackgroundTaskMetadata[]) =>
  states.map(state => state.progress ?? 0);

describe('createBackup (local)', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    (NativeZipArchive.zip as jest.Mock).mockClear();
    (saveDocuments as jest.Mock).mockClear();
  });

  it('zips the downloaded files by default', async () => {
    const { states, setMeta } = createMetaRecorder();

    await createBackup(setMeta);

    expect(NativeZipArchive.zip).toHaveBeenCalledWith(
      ROOT_STORAGE,
      `${CACHE_DIR_PATH}/download.zip`,
    );
    expect(states[states.length - 1]).toEqual(
      expect.objectContaining({ isRunning: false, progress: 4 / 4 }),
    );
  });

  it('skips the downloaded files archive when it is disabled', async () => {
    setOptions({ backupDownloadedFiles: false });
    const { setMeta } = createMetaRecorder();

    await createBackup(setMeta);

    expect(NativeZipArchive.zip).not.toHaveBeenCalledWith(
      ROOT_STORAGE,
      expect.anything(),
    );
    // The final archive is still produced and saved
    expect(NativeZipArchive.zip).toHaveBeenCalledWith(
      CACHE_DIR_PATH,
      `${CACHE_DIR_PATH}.zip`,
    );
    expect(saveDocuments).toHaveBeenCalled();
  });

  it('keeps progress monotonic and finishes at 4/4 when a step is skipped', async () => {
    setOptions({ backupDownloadedFiles: false });
    const { states, setMeta } = createMetaRecorder();

    await createBackup(setMeta);

    const values = progresses(states);
    const wentBackwards = values.some(
      (value, index) => index > 0 && value < values[index - 1],
    );

    expect(wentBackwards).toBe(false);
    expect(values[values.length - 1]).toBe(1);
  });
});

describe('createDriveBackup', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    (uploadMedia as jest.Mock).mockClear();
  });

  it('uploads the downloaded files by default', async () => {
    const { states, setMeta } = createMetaRecorder();

    await createDriveBackup(backupFolder, setMeta);

    expect(uploadMedia).toHaveBeenCalledTimes(2);
    expect(uploadMedia).toHaveBeenLastCalledWith(ROOT_STORAGE);
    expect(states[states.length - 1]).toEqual(
      expect.objectContaining({ isRunning: false, progress: 3 / 3 }),
    );
  });

  it('skips the downloaded files upload when it is disabled', async () => {
    setOptions({ backupDownloadedFiles: false });
    const { states, setMeta } = createMetaRecorder();

    await createDriveBackup(backupFolder, setMeta);

    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(uploadMedia).toHaveBeenCalledWith(CACHE_DIR_PATH);
    expect(states[states.length - 1]).toEqual(
      expect.objectContaining({ isRunning: false, progress: 3 / 3 }),
    );
  });

  it('never reports the skipped uploaded-files step', async () => {
    setOptions({ backupDownloadedFiles: false });
    const { states, setMeta } = createMetaRecorder();

    await createDriveBackup(backupFolder, setMeta);

    const texts = states.map(state => state.progressText);
    expect(texts).not.toContain(
      getString('backupScreen.uploadingDownloadedFiles'),
    );
  });
});

describe('createSelfHostBackup', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    (upload as jest.Mock).mockClear();
  });

  it('uploads the downloaded files by default', async () => {
    const { states, setMeta } = createMetaRecorder();

    await createSelfHostBackup(
      { host: 'https://example.com', backupFolder: 'backup' },
      setMeta,
    );

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith(
      'https://example.com',
      'backup',
      'download.zip',
      ROOT_STORAGE,
    );
    expect(states[states.length - 1]).toEqual(
      expect.objectContaining({ isRunning: false, progress: 3 / 3 }),
    );
  });

  it('skips the downloaded files upload when it is disabled', async () => {
    setOptions({ backupDownloadedFiles: false });
    const { states, setMeta } = createMetaRecorder();

    await createSelfHostBackup(
      { host: 'https://example.com', backupFolder: 'backup' },
      setMeta,
    );

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(
      'https://example.com',
      'backup',
      'data.zip',
      CACHE_DIR_PATH,
    );
    expect(states[states.length - 1]).toEqual(
      expect.objectContaining({ isRunning: false, progress: 3 / 3 }),
    );
  });
});
