import {
  BACKUP_OPTIONS,
  getBackupOptions,
  initialBackupOptions,
  useBackupOptions,
} from '@hooks/persisted/useBackupOptions';
import { act, renderHook } from '@testing-library/react-native';

import { MMKVStorage } from '../../../utils/mmkv/mmkv';

describe('useBackupOptions', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
  });

  it('enables every section by default', () => {
    const { result } = renderHook(() => useBackupOptions());

    expect(result.current.backupNovels).toBe(true);
    expect(result.current.backupDownloadedFiles).toBe(true);
    expect(result.current.backupCategories).toBe(true);
    expect(result.current.backupRepositories).toBe(true);
    expect(result.current.backupSettings).toBe(true);
  });

  it('persists a toggled section without touching the others', () => {
    const { result } = renderHook(() => useBackupOptions());

    act(() => {
      result.current.setBackupOptions({ backupDownloadedFiles: false });
    });

    expect(result.current.backupDownloadedFiles).toBe(false);
    expect(result.current.backupNovels).toBe(true);
    expect(result.current.backupCategories).toBe(true);
    expect(result.current.backupRepositories).toBe(true);
    expect(result.current.backupSettings).toBe(true);
  });

  it('exposes the persisted value to a fresh consumer', () => {
    const { result } = renderHook(() => useBackupOptions());

    act(() => {
      result.current.setBackupOptions({ backupCategories: false });
    });

    const { result: remounted } = renderHook(() => useBackupOptions());
    expect(remounted.current.backupCategories).toBe(false);
  });
});

describe('getBackupOptions', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
  });

  it('returns all sections enabled when nothing is stored', () => {
    expect(getBackupOptions()).toEqual(initialBackupOptions);
  });

  it('merges a partial stored object over the defaults', () => {
    MMKVStorage.set(BACKUP_OPTIONS, JSON.stringify({ backupNovels: false }));

    expect(getBackupOptions()).toEqual({
      ...initialBackupOptions,
      backupNovels: false,
    });
  });

  it('falls back to the defaults when the stored value is corrupted', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    MMKVStorage.set(BACKUP_OPTIONS, '{not json');

    expect(getBackupOptions()).toEqual(initialBackupOptions);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
