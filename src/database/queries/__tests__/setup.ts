/**
 * Test setup file for database query tests
 *
 * This file sets up a real in-memory SQLite database for testing.
 * Tests verify actual data returned by queries, not just function calls.
 */

// @ts-ignore
global.__DEV__ ??= false;

import type { TestDb } from './testDb';

const getTestDbModule = () => require('./testDb') as typeof import('./testDb');

// Module-level variable to hold the test database
// Using 'mock' prefix so Jest allows it in jest.mock() factory
let mockTestDbInstance: TestDb | null = null;

/**
 * Sets up the test database
 * This should be called in beforeEach of test files
 */
export function setupTestDatabase(): TestDb {
  const { createTestDb, cleanupTestDb } = getTestDbModule();
  if (mockTestDbInstance) {
    cleanupTestDb(mockTestDbInstance);
  }
  mockTestDbInstance = createTestDb();
  return mockTestDbInstance;
}

/**
 * Gets the current test database instance
 */
export function getTestDb(): TestDb {
  if (!mockTestDbInstance) {
    throw new Error(
      'Test database not initialized. Call setupTestDatabase() first.',
    );
  }
  return mockTestDbInstance;
}

/**
 * Cleans up the test database
 */
export function teardownTestDatabase() {
  const { cleanupTestDb } = getTestDbModule();
  if (mockTestDbInstance) {
    cleanupTestDb(mockTestDbInstance);
    mockTestDbInstance = null;
  }
}

// Mock utility functions (still needed for tests)
jest.mock('@utils/showToast', () => ({
  showToast: jest.fn(),
}));

jest.mock('@utils/error', () => ({
  getErrorMessage: jest.fn(
    (error: any) => error?.message || String(error) || 'Unknown error',
  ),
}));

jest.mock('@strings/translations', () => ({
  getString: jest.fn((key: string) => key),
}));

jest.mock('@utils/Storages', () => ({
  ROOT_STORAGE: '/mock/storage',
  PLUGIN_STORAGE: '/mock/storage/Plugins',
  NOVEL_STORAGE: '/mock/novel/storage',
}));

// Mock the SAF layer's native + RN dependencies: this project runs in a plain
// node environment where TurboModuleRegistry is unavailable.
jest.mock('@specs/NativeSaf', () => ({
  __esModule: true,
  default: {
    takePersistablePermission: jest.fn().mockResolvedValue(true),
    releaseTreeUri: jest.fn().mockResolvedValue(true),
    hasTreeAccess: jest.fn().mockResolvedValue(true),
    mkdir: jest.fn().mockResolvedValue(true),
    exists: jest.fn().mockResolvedValue(false),
    isDirectory: jest.fn().mockResolvedValue(false),
    writeFile: jest.fn().mockResolvedValue(true),
    readFile: jest.fn().mockResolvedValue(''),
    unlink: jest.fn().mockResolvedValue(true),
    readDir: jest.fn().mockResolvedValue([]),
    move: jest.fn().mockResolvedValue(true),
    getFileSize: jest.fn().mockResolvedValue(0),
    downloadFile: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@react-native-documents/picker', () => ({
  pickDirectory: jest.fn().mockResolvedValue([]),
  keepLocalCopy: jest.fn().mockResolvedValue([]),
  pick: jest.fn().mockResolvedValue([]),
  saveDocuments: jest.fn().mockResolvedValue([]),
}));

jest.mock('react-native-saf-x', () => ({
  __esModule: true,
  hasPermission: jest.fn().mockResolvedValue(false),
  exists: jest.fn().mockResolvedValue(false),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(true),
  stat: jest.fn().mockResolvedValue({ type: 'file' }),
  listFiles: jest.fn().mockResolvedValue([]),
  readFile: jest.fn().mockResolvedValue(''),
  writeFile: jest.fn().mockResolvedValue(undefined),
  copyFile: jest.fn().mockResolvedValue(undefined),
  moveFile: jest.fn().mockResolvedValue(undefined),
  default: {},
}));

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest
      .fn()
      .mockResolvedValue({ granted: false }),
    readDirectoryAsync: jest.fn().mockResolvedValue([]),
    createFileAsync: jest.fn().mockResolvedValue(''),
    moveAsync: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@plugins/local/localServerManager', () => ({
  getLocalServerUrl: jest.fn(() => 'http://127.0.0.1:8080/'),
}));

// In-memory MMKV so the SAF layer's MMKV-backed flags work in the node project.
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string | number | boolean>();
  return {
    createMMKV: () => ({
      set: (key: string, value: string | number | boolean) => {
        store.set(key, value);
      },
      getString: (key: string) => {
        const value = store.get(key);
        return typeof value === 'string' ? value : undefined;
      },
      getNumber: (key: string) => {
        const value = store.get(key);
        return typeof value === 'number' ? value : undefined;
      },
      getBoolean: (key: string) => {
        const value = store.get(key);
        return typeof value === 'boolean' ? value : undefined;
      },
      contains: (key: string) => store.has(key),
      remove: (key: string) => {
        store.delete(key);
      },
      clearAll: () => store.clear(),
      getAllKeys: () => Array.from(store.keys()),
    }),
  };
});

// Mock NativeFile
jest.mock('@specs/NativeFile', () => ({
  __esModule: true,
  default: {
    exists: jest.fn().mockReturnValue(true),
    mkdir: jest.fn(),
    unlink: jest.fn(),
    copyFile: jest.fn(),
    readFile: jest.fn().mockReturnValue(''),
    writeFile: jest.fn(),
  },
}));

// Mock plugin-related modules
jest.mock('@plugins/helpers/fetch', () => ({
  downloadFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@plugins/pluginManager', () => ({
  getPlugin: jest.fn().mockReturnValue({
    imageRequestInit: undefined,
  }),
}));

jest.mock('@services/plugin/fetch', () => ({
  fetchNovel: jest.fn().mockResolvedValue({
    path: '/test/novel',
    name: 'Test Novel',
    cover: 'https://example.com/cover.png',
    summary: 'Test summary',
    author: 'Test Author',
    artist: 'Test Artist',
    status: 'Ongoing',
    genres: 'Fantasy, Adventure',
    totalPages: 1,
    chapters: [],
  }),
}));

// Mock expo-document-picker
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: true,
    assets: null,
  }),
}));

// Mock lodash-es to avoid ES module issues
jest.mock('lodash-es', () => {
  const lodash = jest.requireActual('lodash');
  return {
    ...lodash,
    countBy: lodash.countBy,
  };
});

// Global test timeout
jest.setTimeout(10000);

// Note: Each test file should call setupTestDatabase() in beforeEach
// and clearAllTables() if needed for proper test isolation
// The database is automatically cleaned up in afterAll
afterAll(() => {
  teardownTestDatabase();
});
