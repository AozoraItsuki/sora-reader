import { render, screen } from '@testing-library/react-native';
import type { ThemeColors } from '@theme/types';
import React from 'react';
import { StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import BottomTabBar, { CustomBottomTabBarProps } from '../index';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');

  return { __esModule: true, default: { View } };
});

let mockSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

const TOUCH_TARGET_MIN = 48;
const SLIM_CONTENT_HEIGHT = 56;

const theme: ThemeColors = {
  id: 0,
  name: 'test',
  isDark: false,
  primary: '#6750a4',
  onPrimary: '#ffffff',
  primaryContainer: '#eaddff',
  onPrimaryContainer: '#21005d',
  secondary: '#625b71',
  onSecondary: '#ffffff',
  secondaryContainer: '#e8def8',
  onSecondaryContainer: '#1d192b',
  tertiary: '#7d5260',
  onTertiary: '#ffffff',
  tertiaryContainer: '#ffd8e4',
  onTertiaryContainer: '#31111d',
  error: '#b3261e',
  onError: '#ffffff',
  errorContainer: '#f9dedc',
  onErrorContainer: '#410e0b',
  background: '#fef7ff',
  onBackground: '#1d1b20',
  surface: '#fef7ff',
  onSurface: '#1d1b20',
  surfaceVariant: '#e7e0ec',
  onSurfaceVariant: '#49454f',
  outline: '#79747e',
  outlineVariant: '#cac4d0',
  shadow: '#000000',
  scrim: '#000000',
  inverseSurface: '#322f35',
  inverseOnSurface: '#f5eff7',
  inversePrimary: '#d0bcff',
  surfaceDisabled: '#1d1b2020',
  onSurfaceDisabled: '#1d1b2038',
  backdrop: '#322f35',
};

const makeProps = (
  overrides: Partial<CustomBottomTabBarProps> = {},
): CustomBottomTabBarProps =>
  ({
    state: {
      index: 0,
      key: 'tab',
      routeNames: ['Library', 'Browse'],
      history: [],
      routes: [
        { key: 'Library-1', name: 'Library' },
        { key: 'Browse-1', name: 'Browse' },
      ],
    },
    descriptors: {
      'Library-1': { options: { title: 'Library' } },
      'Browse-1': { options: { title: 'Browse' } },
    },
    navigation: { emit: jest.fn(), navigate: jest.fn() },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    theme,
    showLabelsInNav: true,
    renderIcon: () => React.createElement(Text, null, 'icon'),
    ...overrides,
  } as unknown as CustomBottomTabBarProps);

interface RenderedNode {
  type: string;
  props: { style?: StyleProp<ViewStyle> };
  children: RenderedNode[] | null;
}

const firstChild = (node: RenderedNode): RenderedNode => {
  const child = node.children?.[0];
  if (!child) {
    throw new Error(`expected <${node.type}> to have a rendered child`);
  }
  return child;
};

const barContainer = () => screen.toJSON() as unknown as RenderedNode;

const contentRow = () => firstChild(barContainer());

const styleOf = (node: RenderedNode) =>
  StyleSheet.flatten(node.props.style) as ViewStyle;

describe('BottomTabBar', () => {
  beforeEach(() => {
    mockSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  });

  it('lays tabs out in a slim content row that still clears the 48dp touch target when the bar renders', () => {
    // Given: a bar on a device
    // When: the bar renders
    // Then: the content row is slimmer than the previous 68dp, yet still a valid touch target
    render(<BottomTabBar {...makeProps()} />);

    const rowHeight = styleOf(contentRow()).height ?? 0;

    expect(rowHeight).toBe(SLIM_CONTENT_HEIGHT);
    expect(rowHeight).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN);
  });

  it('gives every tab the full row height as its touch target when tabs are laid out', () => {
    // Given: a bar with two tabs
    // When: the row positions them
    // Then: the row stretches them, instead of centring them at icon + label height
    render(<BottomTabBar {...makeProps()} />);

    expect(styleOf(contentRow()).alignItems).toBe('stretch');
  });

  it('pads the bar by the safe area bottom inset when the window has one', () => {
    // Given: a window with a 48dp navigation bar
    // When: the bar renders
    // Then: the bar is padded clear of the navigation bar
    mockSafeAreaInsets = { top: 0, right: 0, bottom: 48, left: 0 };
    render(<BottomTabBar {...makeProps()} />);

    expect(styleOf(barContainer()).paddingBottom).toBe(48);
  });

  it('pads the bar by the safe area inset when the navigator insets go stale across a rotation', () => {
    // Given: navigator insets captured in portrait
    // When: the bar re-renders after rotating to a window with a smaller inset
    // Then: the bar follows the live safe area inset, not the stale navigator one
    const view = render(
      <BottomTabBar
        {...makeProps({
          insets: { top: 0, right: 0, bottom: 48, left: 0 },
        })}
      />,
    );
    expect(styleOf(barContainer()).paddingBottom).toBe(48);

    mockSafeAreaInsets = { top: 0, right: 0, bottom: 8, left: 0 };
    view.rerender(<BottomTabBar {...makeProps()} />);

    expect(styleOf(barContainer()).paddingBottom).toBe(8);
  });
});
