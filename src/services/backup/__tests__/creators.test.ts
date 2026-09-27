import { uploadMedia } from '@api/drive/request';
import { DriveFile } from '@api/drive/types';
import { upload } from '@api/remote';
import { saveDocuments } from '@react-native-documents/picker';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import NativeZipArchive from '@specs/NativeZipArchive';
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
}));

jest.mock('@api/remote', () => ({
  upload: jest.fn(async () => undefined),
}));

jest.mock('@utils/showToast', () => ({
  showToast: jest.fn(),
}));

const backupFolder = { id: 'folder-id' } as DriveFile;

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

const expectMonotonicProgress = (states: BackgroundTaskMetadata[]) => {
  const values = progresses(states);
  const wentBackwards = values.some(
    (value, index) => index > 0 && value < values[index - 1],
  );
  expect(wentBackwards).toBe(false);
  expect(values[values.length - 1]).toBe(1);
};

describe('createBackup (local)', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    (NativeZipArchive.zip as jest.Mock).mockClear();
    (saveDocuments as jest.Mock).mockClear();
  });

  it('zips the app data and saves it', async () => {
    const { states, setMeta } = createMetaRecorder();

    await createBackup(setMeta);

    expect(NativeZipArchive.zip).toHaveBeenCalledWith(
      CACHE_DIR_PATH,
      `${CACHE_DIR_PATH}.zip`,
    );
    expect(saveDocuments).toHaveBeenCalled();
    expect(states[states.length - 1]).toEqual(
      expect.objectContaining({ isRunning: false, progress: 3 / 3 }),
    );
  });

  it('never zips the download storage', async () => {
    const { setMeta } = createMetaRecorder();

    await createBackup(setMeta);

    expect(NativeZipArchive.zip).not.toHaveBeenCalledWith(
      ROOT_STORAGE,
      expect.anything(),
    );
  });

  it('keeps progress monotonic', async () => {
    const { states, setMeta } = createMetaRecorder();

    await createBackup(setMeta);

    expectMonotonicProgress(states);
  });
});

describe('createDriveBackup', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    (uploadMedia as jest.Mock).mockClear();
  });

  it('uploads only the app data archive', async () => {
    const { states, setMeta } = createMetaRecorder();

    await createDriveBackup(backupFolder, setMeta);

    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(uploadMedia).toHaveBeenCalledWith(CACHE_DIR_PATH);
    expect(states[states.length - 1]).toEqual(
      expect.objectContaining({ isRunning: false, progress: 2 / 2 }),
    );
  });

  it('never uploads the download storage', async () => {
    const { setMeta } = createMetaRecorder();

    await createDriveBackup(backupFolder, setMeta);

    expect(uploadMedia).not.toHaveBeenCalledWith(ROOT_STORAGE);
  });

  it('keeps progress monotonic', async () => {
    const { states, setMeta } = createMetaRecorder();

    await createDriveBackup(backupFolder, setMeta);

    expectMonotonicProgress(states);
  });
});

describe('createSelfHostBackup', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    (upload as jest.Mock).mockClear();
  });

  it('uploads only the app data archive', async () => {
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
      expect.objectContaining({ isRunning: false, progress: 2 / 2 }),
    );
  });

  it('never uploads a downloads archive', async () => {
    const { setMeta } = createMetaRecorder();

    await createSelfHostBackup(
      { host: 'https://example.com', backupFolder: 'backup' },
      setMeta,
    );

    expect(upload).not.toHaveBeenCalledWith(
      'https://example.com',
      'backup',
      'download.zip',
      ROOT_STORAGE,
    );
  });

  it('keeps progress monotonic', async () => {
    const { states, setMeta } = createMetaRecorder();

    await createSelfHostBackup(
      { host: 'https://example.com', backupFolder: 'backup' },
      setMeta,
    );

    expectMonotonicProgress(states);
  });
});
