import { ThemeProvider } from '@hooks/persisted/useTheme';
import type { TermsSettingsScreenProps } from '@navigators/types';
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

import SettingsTermsScreen from '../SettingsTermsScreen';

jest.mock('@components/Appbar/Appbar', () => () => null);
jest.mock('@database/queries/NovelQueries', () => ({
  getAllNovels: jest.fn().mockResolvedValue([]),
}));
jest.mock('@utils/readerTerms', () => {
  const actual = jest.requireActual('@utils/readerTerms');
  return {
    ...actual,
    getGlobalTerms: jest.fn(() => []),
    getNovelTerms: jest.fn(() => []),
    saveGlobalTerms: jest.fn(),
    saveNovelTerms: jest.fn(),
  };
});

const { getAllNovels } = jest.requireMock('@database/queries/NovelQueries') as {
  getAllNovels: jest.Mock;
};
const { getGlobalTerms, getNovelTerms, saveGlobalTerms, saveNovelTerms } =
  jest.requireMock('@utils/readerTerms') as {
    getGlobalTerms: jest.Mock;
    getNovelTerms: jest.Mock;
    saveGlobalTerms: jest.Mock;
    saveNovelTerms: jest.Mock;
  };

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = () => {
  const navigation = {
    goBack: jest.fn(),
  } as unknown as TermsSettingsScreenProps['navigation'];
  const route = {
    key: 'terms-settings',
    name: 'TermsSettings',
  } as unknown as TermsSettingsScreenProps['route'];

  return render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ThemeProvider>
          <PaperProvider>
            <SettingsTermsScreen navigation={navigation} route={route} />
          </PaperProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
};

// The jest projects in this repo do not inherit `clearMocks`, so each case
// starts from the storage defaults and an empty call log.
beforeEach(() => {
  getGlobalTerms.mockReturnValue([]);
  getNovelTerms.mockReturnValue([]);
  saveGlobalTerms.mockClear();
  saveNovelTerms.mockClear();
});

const fillEditor = (from: string, to: string, color?: string) => {
  fireEvent.changeText(screen.getByTestId('term-from-input'), from);
  fireEvent.changeText(screen.getByTestId('term-to-input'), to);
  if (color !== undefined) {
    fireEvent.changeText(screen.getByTestId('term-color-input'), color);
  }
};

describe('SettingsTermsScreen global terms', () => {
  it('adds a new term through saveGlobalTerms', () => {
    renderScreen();
    fireEvent.press(screen.getByText(getString('termsSettingsScreen.addTerm')));

    fillEditor('kuma', 'bear');
    fireEvent.press(screen.getByTestId('term-save-button'));

    expect(saveGlobalTerms).toHaveBeenCalledWith([
      expect.objectContaining({ from: 'kuma', to: 'bear', scope: 'global' }),
    ]);
  });

  it('normalizes an RGB color to #rrggbb before saving', () => {
    renderScreen();
    fireEvent.press(screen.getByText(getString('termsSettingsScreen.addTerm')));

    fillEditor('kuma', 'bear', '0,128,255');
    fireEvent.press(screen.getByTestId('term-save-button'));

    expect(saveGlobalTerms).toHaveBeenCalledWith([
      expect.objectContaining({
        style: expect.objectContaining({ color: '#0080ff' }),
      }),
    ]);
  });

  it('normalizes a hashless short hex color before saving', () => {
    renderScreen();
    fireEvent.press(screen.getByText(getString('termsSettingsScreen.addTerm')));

    fillEditor('kuma', 'bear', 'f00');
    fireEvent.press(screen.getByTestId('term-save-button'));

    expect(saveGlobalTerms).toHaveBeenCalledWith([
      expect.objectContaining({
        style: expect.objectContaining({ color: '#ff0000' }),
      }),
    ]);
  });

  it('rejects an invalid color with an inline error and saves nothing', () => {
    renderScreen();
    fireEvent.press(screen.getByText(getString('termsSettingsScreen.addTerm')));

    fillEditor('kuma', 'bear', '256,0,0');
    fireEvent.press(screen.getByTestId('term-save-button'));

    expect(
      screen.getByText(getString('termsSettingsScreen.colorInvalidError')),
    ).toBeTruthy();
    expect(saveGlobalTerms).not.toHaveBeenCalled();
  });

  it('replaces the edited term instead of appending a duplicate', () => {
    getGlobalTerms.mockReturnValue([
      {
        id: 'g1',
        from: 'kuma',
        to: 'bear',
        scope: 'global',
        caseSensitive: false,
      },
    ]);
    renderScreen();

    fireEvent.press(screen.getByText('kuma'));
    fireEvent.changeText(screen.getByTestId('term-to-input'), 'wolf');
    fireEvent.press(screen.getByTestId('term-save-button'));

    expect(saveGlobalTerms).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'g1', to: 'wolf' }),
    ]);
  });

  it('deletes a global term through saveGlobalTerms', () => {
    getGlobalTerms.mockReturnValue([
      {
        id: 'g1',
        from: 'kuma',
        to: 'bear',
        scope: 'global',
        caseSensitive: false,
      },
    ]);
    renderScreen();

    fireEvent.press(screen.getByTestId('term-delete-g1'));

    expect(saveGlobalTerms).toHaveBeenCalledWith([]);
  });
});

describe('SettingsTermsScreen per-novel terms', () => {
  beforeEach(() => {
    getAllNovels.mockResolvedValue([
      { id: 7, name: 'Test Novel', path: 'p', pluginId: 'local' },
    ]);
  });

  it('loads the picked novel terms when a novel is selected', async () => {
    getNovelTerms.mockReturnValue([
      {
        id: 'n1',
        from: 'kuma',
        to: 'bear',
        scope: 'novel',
        caseSensitive: true,
      },
    ]);
    renderScreen();

    fireEvent.press(
      screen.getByText(getString('termsSettingsScreen.perNovelTab')),
    );
    fireEvent.press(await screen.findByText('Test Novel'));

    await waitFor(() => expect(getNovelTerms).toHaveBeenCalledWith(7));
    expect(
      screen.getByText(getString('termsSettingsScreen.novelTerms')),
    ).toBeTruthy();
  });

  it('adds a term through saveNovelTerms for the picked novel', async () => {
    renderScreen();

    fireEvent.press(
      screen.getByText(getString('termsSettingsScreen.perNovelTab')),
    );
    fireEvent.press(await screen.findByText('Test Novel'));
    await waitFor(() => expect(getNovelTerms).toHaveBeenCalledWith(7));

    fireEvent.press(screen.getByText(getString('termsSettingsScreen.addTerm')));
    fillEditor('kuma', 'bear');
    fireEvent.press(screen.getByTestId('term-save-button'));

    expect(saveNovelTerms).toHaveBeenCalledWith(7, [
      expect.objectContaining({ from: 'kuma', to: 'bear', scope: 'novel' }),
    ]);
    expect(saveGlobalTerms).not.toHaveBeenCalled();
  });

  it('deletes a novel term through saveNovelTerms', async () => {
    getNovelTerms.mockReturnValue([
      {
        id: 'n1',
        from: 'kuma',
        to: 'bear',
        scope: 'novel',
        caseSensitive: false,
      },
    ]);
    renderScreen();

    fireEvent.press(
      screen.getByText(getString('termsSettingsScreen.perNovelTab')),
    );
    fireEvent.press(await screen.findByText('Test Novel'));
    await waitFor(() => expect(getNovelTerms).toHaveBeenCalledWith(7));

    fireEvent.press(screen.getByTestId('term-delete-n1'));

    expect(saveNovelTerms).toHaveBeenCalledWith(7, []);
  });
});
