import { ThemeProvider } from '@hooks/persisted/useTheme';
import type { DownloadSettingsScreenProps } from '@navigators/types';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsDownloadScreen from '../SettingsDownloadScreen';

jest.mock('@hooks/persisted', () => {
  const theme = jest.requireActual('@hooks/persisted/useTheme');
  return {
    useTheme: theme.useTheme,
    useAppSettings: () => ({
      downloadNewChapters: false,
      setAppSettings: jest.fn(),
    }),
    useDownloadSettings: () => ({
      parallelChaptersEnabled: false,
      parallelChaptersCount: 3,
      parallelNovelsEnabled: false,
      retryOnError: true,
      retryDelaySeconds: 60,
      chapterDelaySeconds: 0,
      proxyEnabled: false,
      proxy: { mode: 'disabled' },
      setDownloadSettings: jest.fn(),
    }),
    defaultProxyConfig: { mode: 'disabled' },
  };
});

jest.mock('@components/Appbar/Appbar', () => () => null);
jest.mock('../modals/ParallelChaptersCountModal', () => () => null);
jest.mock('../modals/ProxySettingsModal', () => () => null);
jest.mock('../modals/ChapterDelayModal', () => () => null);
jest.mock('../modals/RetryDelayModal', () => () => null);
jest.mock('@services/saf/migrateToSaf', () => ({
  runSafMigration: jest.fn().mockResolvedValue(undefined),
  hasLegacyDownloads: jest.fn().mockReturnValue(false),
}));
jest.mock('@utils/showToast', () => ({ showToast: jest.fn() }));
jest.mock('react-native-saf-x', () => ({
  __esModule: true,
  openDocumentTree: jest.fn().mockResolvedValue(null),
  default: {},
}));

const { openDocumentTree } = jest.requireMock('react-native-saf-x') as {
  openDocumentTree: jest.Mock;
};
const nativeFile = NativeFile as jest.Mocked<typeof NativeFile>;

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = () => {
  const navigation = {
    goBack: jest.fn(),
  } as unknown as DownloadSettingsScreenProps['navigation'];
  const route = {
    key: 'download-settings',
    name: 'DownloadSettings',
  } as unknown as DownloadSettingsScreenProps['route'];

  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ThemeProvider>
          <PaperProvider>
            <SettingsDownloadScreen navigation={navigation} route={route} />
          </PaperProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
};

/** The row text of the download-folder entry, description included. */
const downloadFolderRow = () =>
  screen.getByText(getString('downloadSettingsScreen.downloadFolder'));

describe('SettingsDownloadScreen shared download root', () => {
  beforeEach(() => {
    nativeFile.hasAllFilesAccess.mockReturnValue(true);
    nativeFile.openAllFilesAccessSettings.mockClear();
    openDocumentTree.mockClear();
  });

  it('reports the fixed folder instead of offering a picker', async () => {
    renderScreen();

    expect(
      await screen.findByText(
        getString('downloadSettingsScreen.downloadFolderShared'),
        { exact: false },
      ),
    ).toBeTruthy();
  });

  it('never opens a picker, even when the row is pressed', async () => {
    renderScreen();
    await screen.findByText(
      getString('downloadSettingsScreen.downloadFolderShared'),
      { exact: false },
    );

    downloadFolderRow();
    fireEvent.press(
      screen.getByText(getString('downloadSettingsScreen.downloadFolder')),
    );

    await waitFor(() =>
      expect(nativeFile.openAllFilesAccessSettings).toHaveBeenCalled(),
    );
    expect(openDocumentTree).not.toHaveBeenCalled();
  });

  it('says so when the grant was revoked in system settings', async () => {
    nativeFile.hasAllFilesAccess.mockReturnValue(false);

    renderScreen();

    expect(
      await screen.findByText(
        getString('downloadSettingsScreen.downloadFolderAccessLost'),
        { exact: false },
      ),
    ).toBeTruthy();
  });
});
