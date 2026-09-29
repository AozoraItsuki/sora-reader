import { ThemeProvider } from '@hooks/persisted/useTheme';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { scanOrphanDownloads } from '@utils/orphanDownloads';
import { showToast } from '@utils/showToast';
import React from 'react';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import StorageUsageSection from '../StorageUsageSection';

jest.mock('@hooks/persisted', () => {
  const theme = jest.requireActual('@hooks/persisted/useTheme');
  return { useTheme: theme.useTheme };
});

jest.mock('@utils/orphanDownloads', () => ({
  scanOrphanDownloads: jest.fn(() => []),
}));

jest.mock('@utils/showToast', () => ({ showToast: jest.fn() }));

// The shared native mock predates getFreeSpace; without it the section's
// info fetch throws before reaching the orphan scan.
const nativeFileMock = jest.requireMock('@specs/NativeFile') as {
  default: Record<string, jest.Mock>;
};
nativeFileMock.default.getFreeSpace = jest.fn(() => 0);

// InteractionManager never drains in the jest env, which would leave the
// deferred storage scan (and the orphans it finds) unobserved forever.
jest.mock('react-native/Libraries/Interaction/InteractionManager', () => {
  const actual = jest.requireActual(
    'react-native/Libraries/Interaction/InteractionManager',
  );
  return {
    __esModule: true,
    ...actual,
    default: {
      ...(actual.default ?? {}),
      runAfterInteractions: (task: () => void) => {
        task();
        return { cancel: () => undefined };
      },
    },
  };
});

const mockScan = scanOrphanDownloads as jest.Mock;
const mockToast = showToast as jest.Mock;
const unlinkMock = NativeFile.unlink as jest.Mock;

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderSection = () =>
  render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <PaperProvider>
          <ThemeProvider>
            <StorageUsageSection />
          </ThemeProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );

describe('StorageUsageSection orphan row', () => {
  beforeEach(() => {
    mockScan.mockClear();
    mockScan.mockReturnValue([]);
    mockToast.mockClear();
    unlinkMock.mockClear();
  });

  it('shows the no-orphans label when the scan finds nothing', async () => {
    renderSection();

    await waitFor(() => {
      expect(
        screen.getByText(getString('advancedSettingsScreen.noOrphans')),
      ).toBeTruthy();
    });
  });

  it('lists count and size, then deletes after confirm', async () => {
    mockScan.mockReturnValue([
      { path: '/mock/storage/SoraReader/Novels/p/1', bytes: 2048 },
      { path: '/mock/storage/SoraReader/Novels/p/2', bytes: 2048 },
    ]);
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((...args: unknown[]) => {
        const buttons = args[2] as Array<{
          text?: string;
          onPress?: () => void;
        }>;
        buttons
          .find(button => button.text === getString('common.delete'))
          ?.onPress?.();
      });
    renderSection();

    // Wait for the async orphan scan before pressing: the handler reads the
    // scanned state, so pressing earlier would no-op on an empty list.
    await screen.findByText(
      getString('advancedSettingsScreen.orphansFound', {
        count: 2,
        size: '4 KB',
      }),
    );
    const row = screen.getByText(
      getString('advancedSettingsScreen.cleanOrphans'),
    );
    fireEvent.press(row);

    expect(unlinkMock).toHaveBeenCalledWith(
      '/mock/storage/SoraReader/Novels/p/1',
    );
    expect(unlinkMock).toHaveBeenCalledWith(
      '/mock/storage/SoraReader/Novels/p/2',
    );
    expect(mockToast).toHaveBeenCalledWith(
      getString('advancedSettingsScreen.orphansCleared'),
    );
    alertSpy.mockRestore();
  });

  it('deletes nothing when the confirm is cancelled', async () => {
    mockScan.mockReturnValue([
      { path: '/mock/storage/SoraReader/Novels/p/1', bytes: 1024 },
    ]);
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    renderSection();

    const row = await screen.findByText(
      getString('advancedSettingsScreen.cleanOrphans'),
    );
    fireEvent.press(row);

    expect(unlinkMock).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
