import {
  deleteReadingProgress,
  getReadingProgress,
  readReadingProgressMap,
  saveReadingProgress,
} from '@hooks/persisted/useReadingProgress';
import { ThemeProvider } from '@hooks/persisted/useTheme';
import { getString } from '@strings/translations';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ProgressScreen from '../ProgressScreen';

jest.mock('@utils/showToast', () => ({ showToast: jest.fn() }));

jest.mock('../components/ClearProgressDialog', () => ({
  __esModule: true,
  default: ({
    dialogVisible,
    novelName,
    onSubmit,
    hideDialog,
  }: {
    dialogVisible: boolean;
    novelName?: string;
    onSubmit: () => void;
    hideDialog: () => void;
  }) => {
    const { Text, View, Pressable } = require('react-native');
    if (!dialogVisible) {
      return null;
    }
    return (
      <View testID="clear-dialog">
        <Text>{novelName ? `confirm:${novelName}` : 'confirm:all'}</Text>
        <Pressable testID="dialog-cancel" onPress={hideDialog}>
          <Text>cancel</Text>
        </Pressable>
        <Pressable testID="dialog-confirm" onPress={onSubmit}>
          <Text>confirm</Text>
        </Pressable>
      </View>
    );
  },
}));

// The real `Appbar.BackAction` imports a PNG asset that has no jest mapping, so
// the app bar is stubbed down to its title plus whatever actions it renders.
jest.mock('@components', () => {
  const { Text, View } = require('react-native');
  return {
    Appbar: ({ title, children }: any) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
    SafeAreaView: ({ children }: any) => <View>{children}</View>,
    EmptyView: ({ description }: { description: string }) => (
      <Text>{description}</Text>
    ),
  };
});

jest.mock('react-native-paper', () => {
  const actual = jest.requireActual('react-native-paper');
  const { Text } = require('react-native');
  return {
    ...actual,
    Appbar: {
      ...actual.Appbar,
      Action: ({
        onPress,
        accessibilityLabel,
      }: {
        onPress: () => void;
        accessibilityLabel?: string;
      }) => <Text onPress={onPress}>{accessibilityLabel ?? 'clear-all'}</Text>,
    },
  };
});

const mockToast = showToast as jest.Mock;

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = () =>
  render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <PaperProvider>
          <ThemeProvider>
            <ProgressScreen
              navigation={{ goBack: jest.fn() } as never}
              route={{ key: 'Progress', name: 'Progress' } as never}
            />
          </ThemeProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );

describe('ProgressScreen', () => {
  beforeEach(() => {
    mockToast.mockClear();
    MMKVStorage.clearAll();
  });

  it('shows the empty state when nothing was ever saved', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText(getString('progressScreen.empty'))).toBeTruthy();
    });
    expect(screen.queryByText(getString('progressScreen.clearAll'))).toBeNull();
  });

  it('lists a saved novel with its chapter and progress', async () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      novelName: 'Novel A',
      chapterId: 11,
      chapterName: 'Chapter 11',
      position: 42,
      updatedAt: 1_700_000_000_000,
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Novel A')).toBeTruthy();
    });
    expect(screen.getByText(/Chapter 11 • Progress 42 %/)).toBeTruthy();
  });

  it('deletes a single entry only after confirmation', async () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      novelName: 'Novel A',
      chapterId: 11,
      chapterName: 'Chapter 11',
      position: 42,
    });
    saveReadingProgress({
      pluginId: 'plugin-b',
      novelId: 2,
      novelName: 'Novel B',
      chapterId: 22,
      chapterName: 'Chapter 22',
      position: 7,
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Novel A')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Novel A'));

    // Nothing is removed until the user confirms.
    expect(screen.getByText('confirm:Novel A')).toBeTruthy();
    expect(screen.getByText('Novel A')).toBeTruthy();

    fireEvent.press(screen.getByText('confirm'));

    await waitFor(() => {
      expect(screen.queryByText('Novel A')).toBeNull();
    });
    expect(screen.getByText('Novel B')).toBeTruthy();
    expect(getReadingProgress('plugin-a', 1)).toBeUndefined();
    expect(getReadingProgress('plugin-b', 2)?.novelName).toBe('Novel B');
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('keeps the entry when the delete dialog is cancelled', async () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      novelName: 'Novel A',
      chapterId: 11,
      position: 42,
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Novel A')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Novel A'));
    fireEvent.press(screen.getByText('cancel'));

    expect(screen.getByText('Novel A')).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('clears every entry from the app-bar action', async () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      novelName: 'Novel A',
      chapterId: 11,
      position: 42,
    });
    saveReadingProgress({
      pluginId: 'plugin-b',
      novelId: 2,
      novelName: 'Novel B',
      chapterId: 22,
      position: 7,
    });

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText(getString('progressScreen.clearAll')),
      ).toBeTruthy();
    });

    fireEvent.press(screen.getByText(getString('progressScreen.clearAll')));
    expect(screen.getByText('confirm:all')).toBeTruthy();

    fireEvent.press(screen.getByText('confirm'));

    await waitFor(() => {
      expect(screen.getByText(getString('progressScreen.empty'))).toBeTruthy();
    });
    expect(screen.queryByText('Novel A')).toBeNull();
    expect(screen.queryByText('Novel B')).toBeNull();
    expect(Object.keys(readReadingProgressMap())).toEqual([]);
    expect(getReadingProgress('plugin-a', 1)).toBeUndefined();
    expect(getReadingProgress('plugin-b', 2)).toBeUndefined();
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('renders a row the reader saves while the screen is already open', async () => {
    // The reader writes through the module-level helper on every scroll tick, so
    // the MMKV subscription is the only thing that can refresh this list. Seeding
    // MMKV before mounting would never prove that.
    renderScreen();

    expect(screen.queryByText('Novel A')).toBeNull();
    expect(screen.queryByText(getString('progressScreen.clearAll'))).toBeNull();

    await act(async () => {
      saveReadingProgress({
        pluginId: 'plugin-a',
        novelId: 1,
        novelName: 'Novel A',
        chapterId: 11,
        chapterName: 'Chapter 11',
        position: 42,
        updatedAt: 1_700_000_000_000,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Novel A')).toBeTruthy();
    });
    expect(screen.getByText(/Chapter 11 • Progress 42 %/)).toBeTruthy();
    // The clear-all action appears only once there is something to clear.
    expect(screen.getByText(getString('progressScreen.clearAll'))).toBeTruthy();
  });

  it('drops a row removed outside this screen and keeps the rest', async () => {
    saveReadingProgress({
      pluginId: 'plugin-a',
      novelId: 1,
      novelName: 'Novel A',
      chapterId: 11,
      chapterName: 'Chapter 11',
      position: 42,
      updatedAt: 100,
    });
    saveReadingProgress({
      pluginId: 'plugin-b',
      novelId: 2,
      novelName: 'Novel B',
      chapterId: 22,
      chapterName: 'Chapter 22',
      position: 7,
      updatedAt: 200,
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Novel B')).toBeTruthy();
    });

    // Newest first, straight from the store.
    expect(screen.getByText('Novel B')).toBeTruthy();
    expect(screen.getByText('Novel A')).toBeTruthy();

    await act(async () => {
      deleteReadingProgress('plugin-b', 2);
    });

    await waitFor(() => {
      expect(screen.queryByText('Novel B')).toBeNull();
    });
    expect(screen.getByText('Novel A')).toBeTruthy();
    expect(readReadingProgressMap()).toEqual({
      'plugin-a:1': expect.objectContaining({ novelName: 'Novel A' }),
    });
  });
});
