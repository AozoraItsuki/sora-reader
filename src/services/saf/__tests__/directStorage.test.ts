import NativeFile from '@specs/NativeFile';
import { writeAsStringAsync } from 'expo-file-system/legacy';

import { directWriteFile } from '../directStorage';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

const ABS = '/mock/storage/SoraReader/Novels/local/569/cover.png';

describe('directWriteFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes base64 payloads through the native decoder, never expo', async () => {
    await directWriteFile(ABS, 'aGk=', 'base64');

    // expo rejects shared-storage destinations ("isn't writable").
    expect(NativeFile.writeFileBase64).toHaveBeenCalledWith(ABS, 'aGk=');
    expect(writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('keeps writing utf8 text through NativeFile.writeFile', async () => {
    await directWriteFile(ABS, '<html/>', 'utf8');

    expect(NativeFile.writeFile).toHaveBeenCalledWith(ABS, '<html/>');
    expect(NativeFile.writeFileBase64).not.toHaveBeenCalled();
  });
});
