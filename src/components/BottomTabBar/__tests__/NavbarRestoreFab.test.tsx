import { ThemeProvider } from '@hooks/persisted/useTheme';
import { getString } from '@strings/translations';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react-native';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NavbarRestoreFab from '../NavbarRestoreFab';

jest.mock('@hooks/persisted', () => {
  const theme = jest.requireActual('@hooks/persisted/useTheme');
  const settings = jest.requireMock('@hooks/persisted/useSettings');
  return {
    useTheme: theme.useTheme,
    useAppSettings: settings.useAppSettings,
  };
});

jest.mock('@hooks/persisted/useSettings', () => ({
  __esModule: true,
  useAppSettings: jest.fn(),
}));

jest.mock('@react-native-vector-icons/material-design-icons', () => ({
  __esModule: true,
  default: () => null,
}));

const mockUseAppSettings = jest.requireMock(
  '@hooks/persisted/useSettings',
).useAppSettings as jest.Mock;

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderFab = (position: 'bottom' | 'left' | 'right' = 'bottom') =>
  render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <PaperProvider>
          <ThemeProvider>
            <NavbarRestoreFab position={position} />
          </ThemeProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );

describe('NavbarRestoreFab', () => {
  beforeEach(() => {
    mockUseAppSettings.mockReset();
  });

  it('renders nothing when the navbar is visible', () => {
    mockUseAppSettings.mockReturnValue({
      navbarVisible: true,
      setAppSettings: jest.fn(),
    });
    renderFab();

    expect(
      screen.queryByLabelText(getString('appearanceScreen.showNavbar')),
    ).toBeNull();
  });

  it('restores the navbar on press when hidden', () => {
    const setAppSettings = jest.fn();
    mockUseAppSettings.mockReturnValue({
      navbarVisible: false,
      setAppSettings,
    });
    renderFab();

    const fab = screen.getByLabelText(
      getString('appearanceScreen.showNavbar'),
    );
    fireEvent.press(fab);

    expect(setAppSettings).toHaveBeenCalledWith({ navbarVisible: true });
  });
});
