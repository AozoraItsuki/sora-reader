import { ThemeProvider } from '@hooks/persisted/useTheme';
import { getString } from '@strings/translations';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MoreScreen from '../MoreScreen';

jest.mock('@components/Switch/Switch', () => ({
  __esModule: true,
  default: () => null,
}));

// The entrance animation resolves the list to its final offset immediately.
jest.mock('@hooks', () => ({
  useAnimatedEntrance: () => ({ opacity: 1, translateY: 0 }),
}));

jest.mock('@hooks/persisted', () => {
  const theme = jest.requireActual('@hooks/persisted/useTheme');
  return {
    useTheme: theme.useTheme,
    useLibrarySettings: () => ({
      incognitoMode: false,
      downloadedOnlyMode: false,
      setLibrarySettings: jest.fn(),
    }),
  };
});

jest.mock('@services/ServiceManager', () => ({
  __esModule: true,
  default: { manager: { STORE_KEY: 'TASK_QUEUE' } },
}));

jest.mock('../components/MoreHeader', () => ({
  __esModule: true,
  MoreHeader: () => null,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const createNavigation = () => ({
  addListener: jest.fn(() => jest.fn()),
  isFocused: jest.fn(() => true),
  navigate: jest.fn(),
});

const renderScreen = (navigation: ReturnType<typeof createNavigation>) =>
  render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <PaperProvider>
          <ThemeProvider>
            <MoreScreen
              navigation={navigation as never}
              route={{ key: 'More', name: 'More' } as never}
            />
          </ThemeProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );

describe('MoreScreen', () => {
  it('opens the Progress screen from the library section', () => {
    // Given: the More menu
    const navigation = createNavigation();
    renderScreen(navigation);

    // When: the reading-progress entry is tapped
    fireEvent.press(screen.getByText(getString('progressScreen.title')));

    // Then: it navigates to the Progress screen of the More stack
    expect(navigation.navigate).toHaveBeenCalledWith('MoreStack', {
      screen: 'Progress',
    });
  });

  it('labels the Progress entry with its description', () => {
    renderScreen(createNavigation());

    expect(screen.getByText(getString('progressScreen.title'))).toBeTruthy();
    expect(
      screen.getByText(getString('progressScreen.description')),
    ).toBeTruthy();
  });
});
