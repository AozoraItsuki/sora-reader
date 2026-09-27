import { ThemeProvider } from '@hooks/persisted/useTheme';
import type { DownloadSettingsScreenProps } from '@navigators/types';
import NativeLocalServer from '@specs/NativeLocalServer';
import { getString } from '@strings/translations';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { MMKVStorage } from '@utils/mmkv/mmkv';
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
  openDocumentTree: jest.fn(),
  default: {},
}));

const { openDocumentTree } = jest.requireMock('react-native-saf-x') as {
  openDocumentTree: jest.Mock;
};
const { runSafMigration, hasLegacyDownloads } = jest.requireMock(
  '@services/saf/migrateToSaf',
) as { runSafMigration: jest.Mock; hasLegacyDownloads: jest.Mock };
const { showToast } = jest.requireMock('@utils/showToast') as {
  showToast: jest.Mock;
};
const nativeLocalServer = NativeLocalServer as jest.Mocked<
  typeof NativeLocalServer
>;

const TREE_URI =
  'content://com.android.externalstorage.documents/tree/primary%3ADownload';

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

describe('SettingsDownloadScreen download folder', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    openDocumentTree.mockResolvedValue({ uri: TREE_URI, name: 'Download' });
  });

  it('hands the newly picked tree to the local server without a restart', async () => {
    renderScreen();

    fireEvent.press(
      screen.getByText(getString('downloadSettingsScreen.downloadFolder')),
    );

    await waitFor(() =>
      expect(nativeLocalServer.setSafTreeUri).toHaveBeenCalledWith(TREE_URI),
    );
  });
});

describe('SettingsDownloadScreen migrate button', () => {
  beforeEach(() => {
    MMKVStorage.clearAll();
    runSafMigration.mockClear();
    runSafMigration.mockResolvedValue(undefined);
    showToast.mockClear();
  });

  it('stays grey and does nothing when no legacy files exist', () => {
    hasLegacyDownloads.mockReturnValue(false);
    renderScreen();

    const button = screen.getByText(
      getString('downloadSettingsScreen.migrateFiles'),
    );
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(runSafMigration).not.toHaveBeenCalled();
  });

  it('runs migration and toasts when legacy files exist', async () => {
    hasLegacyDownloads.mockReturnValue(true);
    renderScreen();

    fireEvent.press(
      screen.getByText(getString('downloadSettingsScreen.migrateFiles')),
    );

    await waitFor(() => expect(runSafMigration).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith(
      getString('downloadSettingsScreen.migrateDone'),
    );
  });
});
