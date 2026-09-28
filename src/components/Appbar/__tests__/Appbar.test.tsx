import { render, screen } from '@testing-library/react-native';
import type { ThemeColors } from '@theme/types';
import React from 'react';

import Appbar from '../Appbar';

let mockSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

jest.mock('react-native-paper', () => {
  const ReactLocal = require('react');
  const { Text, View } = require('react-native');

  return {
    Appbar: {
      Header: (props: { statusBarHeight?: number }) =>
        ReactLocal.createElement(View, {
          testID: 'paper-header',
          accessibilityValue: { now: props.statusBarHeight },
        }),
      BackAction: () => null,
      Content: ({ title }: { title: string }) =>
        ReactLocal.createElement(Text, null, title),
    },
  };
});

const theme = new Proxy({} as ThemeColors, { get: () => '#123456' });

const headerStatusBarHeight = () => {
  const header = screen.getByTestId('paper-header');
  return header.props.accessibilityValue.now as number;
};

describe('Appbar', () => {
  beforeEach(() => {
    mockSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  });

  it('offsets the header by the safe area top inset when the window reports one', () => {
    // Given: a window with a 44dp status bar
    // When: the appbar renders
    // Then: the header reserves the status bar height from the safe area inset
    mockSafeAreaInsets = { top: 44, right: 0, bottom: 34, left: 0 };
    render(<Appbar title="Library" theme={theme} />);

    expect(headerStatusBarHeight()).toBe(44);
  });

  it('reserves no status bar space when the window reports no top inset', () => {
    // Given: a window with no top inset (fullscreen / gesture-only chrome)
    // When: the appbar renders
    // Then: the header reserves nothing instead of a stale platform constant
    render(<Appbar title="Library" theme={theme} />);

    expect(headerStatusBarHeight()).toBe(0);
  });

  it('reserves the new status bar height when the window rotates under a fullscreen status bar', () => {
    // Given: a landscape window with a tall cutout inset
    // When: the appbar re-renders
    // Then: the header follows the new inset
    const view = render(<Appbar title="Library" theme={theme} />);
    expect(headerStatusBarHeight()).toBe(0);

    mockSafeAreaInsets = { top: 44, right: 0, bottom: 0, left: 44 };
    view.rerender(<Appbar title="Library" theme={theme} />);

    expect(headerStatusBarHeight()).toBe(44);
  });
});
