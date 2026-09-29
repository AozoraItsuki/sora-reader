import type { CustomThemeInput } from '@hooks/persisted/useCustomThemes';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import CreateThemeModal from '../CreateThemeModal';

const mockOnSave = jest.fn();
const mockOnDismiss = jest.fn();

type ChildrenProps = { children?: ReactNode };
type ButtonProps = ChildrenProps & {
  title: string;
  onPress: () => void;
  testID?: string;
};
type TextInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  testID?: string;
};

jest.mock('@components', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  return {
    Button: ({ title, onPress, testID }: ButtonProps) =>
      React.createElement(
        Pressable,
        { testID: testID ?? `button-${title}`, onPress },
        React.createElement(Text, null, title),
      ),
    Modal: ({ children }: ChildrenProps) =>
      React.createElement(View, null, children),
  };
});

jest.mock('@components/Common', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Row: ({ children }: ChildrenProps) =>
      React.createElement(View, null, children),
  };
});

jest.mock('@components/ThemePicker/ThemePicker', () => ({
  ThemePicker: () => null,
}));

jest.mock('@hooks/persisted', () => ({
  useTheme: () => ({
    isDark: false,
    primary: '#111111',
    onPrimary: '#ffffff',
    surface: '#222222',
    surfaceVariant: '#333333',
    onSurface: '#444444',
    onSurfaceVariant: '#555555',
    outline: '#666666',
    error: '#ff0000',
  }),
}));

jest.mock('@strings/translations', () => ({
  getString: (key: string) => key,
}));

jest.mock('react-native-paper', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Portal: ({ children }: ChildrenProps) =>
      React.createElement(View, null, children),
    TextInput: (props: TextInputProps) =>
      React.createElement(require('react-native').TextInput, props),
  };
});

const nameTheTheme = (name = 'Ocean') => {
  fireEvent.changeText(screen.getByTestId('theme-name-input'), name);
};

const save = () => fireEvent.press(screen.getByTestId('theme-save-button'));

const savedInput = (): CustomThemeInput => mockOnSave.mock.calls[0][0];

describe('CreateThemeModal custom colors', () => {
  beforeEach(() => {
    mockOnSave.mockClear();
    mockOnDismiss.mockClear();
  });

  it('saves the swatch colors when no custom color was typed', () => {
    render(
      <CreateThemeModal
        visible
        onDismiss={mockOnDismiss}
        onSave={mockOnSave}
      />,
    );

    nameTheTheme();
    save();

    expect(savedInput()).toEqual({
      name: 'Ocean',
      primary: '#4611a8',
      background: '#1a1025',
      isDark: true,
    });
  });

  it('normalizes a custom hex primary to #rrggbb', () => {
    render(
      <CreateThemeModal
        visible
        onDismiss={mockOnDismiss}
        onSave={mockOnSave}
      />,
    );

    nameTheTheme();
    fireEvent.changeText(
      screen.getByTestId('theme-primary-color-input'),
      '0AF',
    );
    save();

    expect(savedInput().primary).toBe('#00aaff');
  });

  it('accepts RGB notation for the background as the terms screen does', () => {
    render(
      <CreateThemeModal
        visible
        onDismiss={mockOnDismiss}
        onSave={mockOnSave}
      />,
    );

    nameTheTheme();
    fireEvent.changeText(
      screen.getByTestId('theme-background-color-input'),
      'rgb(1, 2, 3)',
    );
    save();

    expect(savedInput().background).toBe('#010203');
  });

  it('refuses to save an unparseable custom color and says why', () => {
    render(
      <CreateThemeModal
        visible
        onDismiss={mockOnDismiss}
        onSave={mockOnSave}
      />,
    );

    nameTheTheme();
    fireEvent.changeText(
      screen.getByTestId('theme-primary-color-input'),
      'reddish',
    );
    save();

    expect(mockOnSave).not.toHaveBeenCalled();
    expect(
      screen.getByText('appearanceScreen.createTheme.colorInvalidError'),
    ).toBeTruthy();
  });

  it('treats an emptied custom color as invalid because the role requires one', () => {
    render(
      <CreateThemeModal
        visible
        onDismiss={mockOnDismiss}
        onSave={mockOnSave}
      />,
    );

    nameTheTheme();
    fireEvent.changeText(screen.getByTestId('theme-primary-color-input'), '');
    save();

    expect(mockOnSave).not.toHaveBeenCalled();
    expect(
      screen.getByText('appearanceScreen.createTheme.colorInvalidError'),
    ).toBeTruthy();
  });
});
