import { ThemeProvider } from '@hooks/persisted/useTheme';
import { getString } from '@strings/translations';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SetupStorageScreen from '../SetupStorageScreen';

jest.mock('@hooks/persisted', () => {
  const theme = jest.requireActual('@hooks/persisted/useTheme');
  return { useTheme: theme.useTheme };
});
jest.mock('@specs/NativeFile', () => ({
  __esModule: true,
  default: {
    hasAllFilesAccess: jest.fn(() => false),
    openAllFilesAccessSettings: jest.fn(),
  },
}));
jest.mock('@services/saf/safFile', () => ({
  SAF_TREE_ROOT: 'Novels',
  getSafTreeUri: jest.fn(),
  isDirectStorageReady: jest.fn(() => false),
  ensureDirectStorage: jest.fn().mockResolvedValue(false),
  safMkdir: jest.fn().mockResolvedValue(true),
  setSafTreeUri: jest.fn(),
}));
jest.mock('@services/saf/useSafLocation', () => ({
  syncSafTreeUriToServer: jest.fn(),
}));
jest.mock('@services/saf/migrateToSaf', () => ({
  hasLegacyDownloads: jest.fn().mockReturnValue(false),
  runSafMigration: jest.fn().mockResolvedValue(undefined),
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
const nativeFile = jest.requireMock('@specs/NativeFile').default as {
  hasAllFilesAccess: jest.Mock;
  openAllFilesAccessSettings: jest.Mock;
};
const { hasLegacyDownloads, runSafMigration } = jest.requireMock(
  '@services/saf/migrateToSaf',
) as { hasLegacyDownloads: jest.Mock; runSafMigration: jest.Mock };
const { syncSafTreeUriToServer } = jest.requireMock(
  '@services/saf/useSafLocation',
) as { syncSafTreeUriToServer: jest.Mock };
const { ensureDirectStorage, isDirectStorageReady, safMkdir } =
  jest.requireMock('@services/saf/safFile') as {
    ensureDirectStorage: jest.Mock;
    isDirectStorageReady: jest.Mock;
    safMkdir: jest.Mock;
  };

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = (onDone: () => void) => {
  render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ThemeProvider>
          <PaperProvider>
            <SetupStorageScreen onDone={onDone} />
          </PaperProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
};

/** Answer the settings round-trip with the given grant state. */
const answerGrantWith = (granted: boolean) => {
  ensureDirectStorage.mockImplementation(async () => granted);
  isDirectStorageReady.mockReturnValue(granted);
};

describe('SetupStorageScreen', () => {
  beforeEach(() => {
    // `clearMocks` does not reach mocks built inside a `jest.mock` factory, so
    // the call history every assertion below depends on is cleared here.
    [
      ensureDirectStorage,
      hasLegacyDownloads,
      isDirectStorageReady,
      openDocumentTree,
      runSafMigration,
      safMkdir,
      syncSafTreeUriToServer,
    ].forEach(mock => mock.mockClear());
    nativeFile.openAllFilesAccessSettings.mockClear();
    hasLegacyDownloads.mockReturnValue(false);
    nativeFile.hasAllFilesAccess.mockReturnValue(false);
    answerGrantWith(false);
  });

  it('hides the migration action when the legacy folder is empty', () => {
    renderScreen(jest.fn());

    expect(
      screen.queryByText(getString('setupStorage.migrateFiles')),
    ).toBeNull();
  });

  it('offers the migration action while legacy downloads are still there', () => {
    hasLegacyDownloads.mockReturnValue(true);

    renderScreen(jest.fn());

    expect(
      screen.getByText(getString('setupStorage.migrateFiles')),
    ).toBeTruthy();
  });

  it('routes the primary action through the system access screen', async () => {
    const onDone = jest.fn();
    renderScreen(onDone);

    fireEvent.press(screen.getByText(getString('setupStorage.grantAccess')));

    await waitFor(() =>
      expect(nativeFile.openAllFilesAccessSettings).toHaveBeenCalled(),
    );
    expect(ensureDirectStorage).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('reports completion once the grant is in place', async () => {
    answerGrantWith(true);
    const onDone = jest.fn();
    renderScreen(onDone);

    fireEvent.press(screen.getByText(getString('setupStorage.grantAccess')));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(safMkdir).toHaveBeenCalledWith('Novels');
    expect(syncSafTreeUriToServer).toHaveBeenCalled();
  });

  it('stays on the setup screen while access is still refused', async () => {
    answerGrantWith(false);
    const onDone = jest.fn();
    renderScreen(onDone);

    fireEvent.press(screen.getByText(getString('setupStorage.grantAccess')));

    await waitFor(() => expect(ensureDirectStorage).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });

  it('dismisses the setup screen and reports completion on skip', async () => {
    const onDone = jest.fn();
    renderScreen(onDone);

    fireEvent.press(screen.getByText(getString('setupStorage.skip')));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});

describe('SetupStorageScreen migration progress', () => {
  /**
   * A migration that never settles on its own, so the progress the screen shows
   * can be observed while the copy is still in flight.
   */
  const deferredMigration = () => {
    const handle: {
      report?: (done: number, total: number, label: string) => void;
      finish: () => void;
      implementation: (
        onProgress?: (done: number, total: number, label: string) => void,
      ) => Promise<void>;
    } = {
      finish: () => undefined,
      implementation: () => new Promise<void>(() => undefined),
    };
    handle.implementation = onProgress =>
      new Promise<void>(resolve => {
        handle.report = onProgress;
        handle.finish = resolve;
      });
    return handle;
  };

  beforeEach(() => {
    [hasLegacyDownloads, runSafMigration].forEach(mock => mock.mockClear());
    hasLegacyDownloads.mockReturnValue(true);
  });

  it('shows how far the migration has got while it runs', async () => {
    const migration = deferredMigration();
    runSafMigration.mockImplementation(migration.implementation);
    renderScreen(jest.fn());

    fireEvent.press(screen.getByText(getString('setupStorage.migrateFiles')));
    await waitFor(() => expect(migration.report).toBeDefined());
    expect(screen.queryByRole('progressbar')).toBeNull();

    await act(async () => {
      migration.report?.(3, 8, 'Novels/p1/1/5');
    });

    expect(
      screen.getByText(
        getString('setupStorage.migratingProgress', { done: 3, total: 8 }),
      ),
    ).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({
      min: 0,
      max: 100,
      now: 38,
    });

    await act(async () => {
      migration.finish();
    });

    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('forces the migration so a done-marked run can be retried', async () => {
    renderScreen(jest.fn());

    fireEvent.press(screen.getByText(getString('setupStorage.migrateFiles')));

    await waitFor(() =>
      expect(runSafMigration).toHaveBeenCalledWith(expect.any(Function), true),
    );
  });
});
