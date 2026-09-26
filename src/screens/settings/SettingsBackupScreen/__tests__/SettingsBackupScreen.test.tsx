import { useBackupOptions } from '@hooks/persisted/useBackupOptions';
import { ThemeProvider } from '@hooks/persisted/useTheme';
import { BackupSettingsScreenProps } from '@navigators/types';
import { getString } from '@strings/translations';
import {
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react-native';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BackupSettings from '../index';

jest.mock('@services/ServiceManager', () => ({
  __esModule: true,
  default: { manager: { addTask: jest.fn() } },
}));

const { default: mockedServiceManager } = jest.requireMock(
  '@services/ServiceManager',
) as { default: { manager: { addTask: jest.Mock } } };
const mockAddTask = mockedServiceManager.manager.addTask;
jest.mock('../Components/BackupLogModal', () => () => null);
jest.mock('../Components/GoogleDriveModal', () => () => null);
jest.mock('../Components/SelfHostModal', () => () => null);

// The persisted-hook barrel pulls in trackers/plugins and the generated `@env`
// module, neither of which is available in the test environment.
jest.mock('@hooks/persisted', () =>
  jest.requireActual('@hooks/persisted/useTheme'),
);

// react-native-paper's appbar pulls in image assets the test module mapper
// cannot resolve.
jest.mock('@components/Appbar/Appbar', () => () => null);

const SECTION_LABEL_KEYS = [
  'backupScreen.includeNovels',
  'backupScreen.includeDownloadedFiles',
  'backupScreen.includeCategories',
  'backupScreen.includeRepositories',
  'backupScreen.includeSettings',
] as const;

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = () => {
  const navigation = {
    goBack: jest.fn(),
  } as unknown as BackupSettingsScreenProps['navigation'];

  const route = {
    key: 'backup',
    name: 'Backup',
  } as unknown as BackupSettingsScreenProps['route'];

  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ThemeProvider>
          <PaperProvider>
            <BackupSettings navigation={navigation} route={route} />
          </PaperProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
};

describe('SettingsBackupScreen backup sections', () => {
  beforeEach(() => {
    mockAddTask.mockClear();
  });

  it('renders a switch row for every backup section', () => {
    renderScreen();

    expect(
      screen.getByText(getString('backupScreen.backupSections')),
    ).toBeTruthy();
    SECTION_LABEL_KEYS.forEach(key => {
      expect(screen.getByText(getString(key))).toBeTruthy();
      expect(screen.getByText(getString(`${key}Desc`))).toBeTruthy();
    });
  });

  it('keeps the existing backup actions intact', () => {
    renderScreen();

    fireEvent.press(screen.getByText(getString('backupScreen.createBackup')));
    expect(mockAddTask).toHaveBeenCalledWith({ name: 'LOCAL_BACKUP' });

    fireEvent.press(screen.getByText(getString('backupScreen.restoreBackup')));
    expect(mockAddTask).toHaveBeenCalledWith({ name: 'LOCAL_RESTORE' });
  });

  it('persists a section toggle and leaves the other sections alone', () => {
    const { result } = renderHook(() => useBackupOptions());
    renderScreen();

    expect(result.current.backupDownloadedFiles).toBe(true);

    fireEvent.press(
      screen.getByText(getString('backupScreen.includeDownloadedFiles')),
    );

    expect(result.current.backupDownloadedFiles).toBe(false);
    expect(result.current.backupNovels).toBe(true);
    expect(result.current.backupCategories).toBe(true);
    expect(result.current.backupRepositories).toBe(true);
    expect(result.current.backupSettings).toBe(true);
  });
});
