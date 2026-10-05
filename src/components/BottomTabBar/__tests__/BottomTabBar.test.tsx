import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ThemeColors } from '@theme/types';
import React from 'react';
import { StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import BottomTabBar, { CustomBottomTabBarProps } from '../index';

// The bar animates with Reanimated shared values; the mock resolves them to
// their target state so the assertions read the settled layout.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: { View },
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: <T,>(factory: () => T) => factory(),
    withTiming: (value: number) => value,
  };
});

let mockSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

const TOUCH_TARGET_MIN = 48;
const SLIM_CONTENT_HEIGHT = 56;
const RAIL_CONTENT_WIDTH = 72;

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
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    theme,
    showLabelsInNav: true,
    position: 'bottom',
    visible: true,
    renderIcon: () => React.createElement(Text, null, 'icon'),
    ...overrides,
  } as unknown as CustomBottomTabBarProps);

interface RenderedNode {
  type: string;
  props: { style?: StyleProp<ViewStyle>; pointerEvents?: string };
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

  describe('position', () => {
    it('lays the bar out horizontally when it is anchored to the bottom', () => {
      // Given: the default position
      // When: the bar renders
      // Then: the tabs share one horizontal row
      render(<BottomTabBar {...makeProps({ position: 'bottom' })} />);

      const content = styleOf(contentRow());

      expect(content.flexDirection).toBe('row');
      expect(content.height).toBe(SLIM_CONTENT_HEIGHT);
    });

    it.each(['left', 'right'] as const)(
      'stacks the tabs vertically when the bar is anchored to the %s edge',
      position => {
        // Given: a side rail position
        // When: the bar renders
        // Then: the tabs stack in a column instead of a row
        render(<BottomTabBar {...makeProps({ position })} />);

        const content = styleOf(contentRow());

        expect(content.flexDirection).toBe('column');
        expect(content.width).toBe(RAIL_CONTENT_WIDTH);
      },
    );

    it('keeps every rail tab at a valid touch target size', () => {
      // Given: a side rail
      // When: the tabs are laid out
      // Then: each one still spans the full rail width and a 48dp+ touch target
      render(<BottomTabBar {...makeProps({ position: 'left' })} />);

      const pressables = (screen.toJSON() as unknown as RenderedNode)
        .children![0].children!;
      const style = StyleSheet.flatten(pressables[0].props.style) as ViewStyle;

      expect(style.width).toBe('100%');
      expect(style.height).toBe(SLIM_CONTENT_HEIGHT);
      expect(style.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN);
    });

    it('insets a left rail by the left safe area and leaves the right edge alone', () => {
      // Given: a screen cutout on the left edge
      // When: a left rail renders
      // Then: the rail is padded clear of the cutout
      mockSafeAreaInsets = { top: 24, right: 0, bottom: 48, left: 16 };
      render(<BottomTabBar {...makeProps({ position: 'left' })} />);

      const container = styleOf(barContainer());

      expect(container.paddingStart).toBe(16);
      expect(container.paddingTop).toBe(24);
      expect(container.paddingBottom).toBe(48);
    });

    it('insets a right rail by the right safe area and leaves the left edge alone', () => {
      // Given: a screen cutout on the right edge
      // When: a right rail renders
      // Then: the rail is padded clear of the cutout
      mockSafeAreaInsets = { top: 24, right: 16, bottom: 48, left: 0 };
      render(<BottomTabBar {...makeProps({ position: 'right' })} />);

      const container = styleOf(barContainer());

      expect(container.paddingStart).toBe(0);
      expect(container.paddingTop).toBe(24);
      expect(container.paddingBottom).toBe(48);
    });
  });

  describe('visibility', () => {
    it('collapses the bar and stops it taking touches when it is hidden', () => {
      // Given: the user turned the navbar off
      // When: the bar renders
      // Then: it animates to no height and stops intercepting touches
      mockSafeAreaInsets = { top: 0, right: 0, bottom: 48, left: 0 };
      render(<BottomTabBar {...makeProps({ visible: false })} />);

      const container = barContainer();

      expect(styleOf(container).height).toBe(0);
      expect(styleOf(container).paddingBottom).toBe(0);
      expect(container.props.pointerEvents).toBe('none');
    });

    it('expands the bar back over the safe area when it is shown again', () => {
      // Given: a bar hidden by the setting
      // When: the setting flips back on
      // Then: the bar animates back to its full height and takes touches again
      mockSafeAreaInsets = { top: 0, right: 0, bottom: 48, left: 0 };
      render(<BottomTabBar {...makeProps({ visible: false })} />);

      screen.rerender(<BottomTabBar {...makeProps({ visible: true })} />);

      const container = barContainer();

      expect(styleOf(container).height).toBe(SLIM_CONTENT_HEIGHT + 48);
      expect(styleOf(container).paddingBottom).toBe(48);
      expect(container.props.pointerEvents).toBe('auto');
    });

    it('collapses a side rail to no width when it is hidden', () => {
      // Given: a side rail hidden by the setting
      // When: the bar renders
      // Then: it animates to no width, releasing the column for the screen
      render(
        <BottomTabBar {...makeProps({ position: 'left', visible: false })} />,
      );

      const container = styleOf(barContainer());

      expect(container.width).toBe(0);
      expect(container.paddingStart).toBe(0);
    });
  });

  it('keeps the tabs tappable after being repositioned', () => {
    // Given: a rail with two tabs
    // When: the inactive tab is pressed
    // Then: navigation still runs, so the rail does not break touch input
    const navigation = {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    };
    render(
      <BottomTabBar
        {...makeProps({ position: 'left', navigation: navigation as never })}
      />,
    );

    fireEvent.press(screen.getByText('Browse'));

    expect(navigation.navigate).toHaveBeenCalledWith('Browse', undefined);
  });
});
