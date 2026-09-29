import NativeFile from '@specs/NativeFile';
import { SHARED_NOVELS, SHARED_ROOT } from '@utils/Storages';

import { dirsToCreate, ensureSharedDirs, sharedDirs } from '../sharedDirs';

const mkdirMock = NativeFile.mkdir as jest.Mock;

describe('dirsToCreate', () => {
  it('keeps the root before the novels root so parents exist first', () => {
    expect(
      dirsToCreate('/sdcard/SoraReader', '/sdcard/SoraReader/Novels'),
    ).toEqual(['/sdcard/SoraReader', '/sdcard/SoraReader/Novels']);
  });

  it('creates nothing when the device reports no storage root', () => {
    expect(dirsToCreate('', '')).toEqual([]);
  });

  it('never hands an empty path to the filesystem', () => {
    expect(dirsToCreate('', '/sdcard/SoraReader/Novels')).toEqual([
      '/sdcard/SoraReader/Novels',
    ]);
  });
});

describe('sharedDirs', () => {
  it('returns the shared root before the novels root so parents exist first', () => {
    expect(sharedDirs()).toEqual([SHARED_ROOT, SHARED_NOVELS]);
  });
});

describe('ensureSharedDirs', () => {
  beforeEach(() => {
    mkdirMock.mockClear();
  });

  it('creates both shared directories', () => {
    ensureSharedDirs();

    expect(mkdirMock).toHaveBeenCalledTimes(2);
    expect(mkdirMock).toHaveBeenNthCalledWith(1, SHARED_ROOT);
    expect(mkdirMock).toHaveBeenNthCalledWith(2, SHARED_NOVELS);
  });

  it('swallows a native failure so boot cannot be interrupted', () => {
    mkdirMock.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(() => ensureSharedDirs()).not.toThrow();
  });
});
