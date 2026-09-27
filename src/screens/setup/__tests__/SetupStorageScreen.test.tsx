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
jest.mock('@services/saf/safFile', () => ({
  SAF_TREE_ROOT: 'Novels',
  getSafTreeUri: jest.fn(),
  safMkdir: jest.fn().mockResolvedValue(true),
  setSafTreeUri: jest.fn(),
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
const { hasLegacyDownloads, runSafMigration } = jest.requireMock(
  '@services/saf/migrateToSaf',
) as { hasLegacyDownloads: jest.Mock; runSafMigration: jest.Mock };
const { safMkdir, setSafTreeUri, getSafTreeUri } = jest.requireMock(
  '@services/saf/safFile',
) as {
  safMkdir: jest.Mock;
  setSafTreeUri: jest.Mock;
  getSafTreeUri: jest.Mock;
};

const TREE_URI =
  'content://com.android.externalstorage.documents/tree/primary%3ADownload';

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

describe('SetupStorageScreen', () => {
  beforeEach(() => {
    // `clearMocks` does not reach mocks built inside a `jest.mock` factory, so
    // the call history every assertion below depends on is cleared here.
    [
      getSafTreeUri,
      hasLegacyDownloads,
      openDocumentTree,
      runSafMigration,
      safMkdir,
      setSafTreeUri,
    ].forEach(mock => mock.mockClear());
    hasLegacyDownloads.mockReturnValue(false);
    getSafTreeUri.mockReturnValue(TREE_URI);
    openDocumentTree.mockResolvedValue({ uri: TREE_URI, name: 'Download' });
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

  it('hands the picked folder to the migration and reports completion', async () => {
    const onDone = jest.fn();
    renderScreen(onDone);

    fireEvent.press(screen.getByText(getString('setupStorage.chooseFolder')));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setSafTreeUri).toHaveBeenCalledWith(TREE_URI);
    expect(safMkdir).toHaveBeenCalledWith('Novels');
    expect(runSafMigration).toHaveBeenCalled();
  });

  it('stays on the setup screen when the picker is dismissed', async () => {
    openDocumentTree.mockResolvedValue(null);
    const onDone = jest.fn();
    renderScreen(onDone);

    fireEvent.press(screen.getByText(getString('setupStorage.chooseFolder')));

    await waitFor(() => expect(openDocumentTree).toHaveBeenCalled());
    expect(setSafTreeUri).not.toHaveBeenCalled();
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
