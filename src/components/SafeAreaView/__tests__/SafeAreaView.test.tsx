import {
  type NavbarLayout,
  NavbarLayoutContext,
} from '@components/BottomTabBar/context';
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import SafeAreaView from '../SafeAreaView';

let mockInsets = { top: 24, right: 0, bottom: 48, left: 0 };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

const renderWithNavbar = (
  props: Partial<React.ComponentProps<typeof SafeAreaView>> = {},
  layout?: Partial<NavbarLayout>,
) =>
  render(
    <NavbarLayoutContext.Provider
      value={{ position: 'bottom', visible: true, ...layout }}
    >
      <SafeAreaView {...props}>
        <></>
      </SafeAreaView>
    </NavbarLayoutContext.Provider>,
  );

const paddingOf = () => {
  const root = screen.toJSON();
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    throw new Error('expected SafeAreaView to render a single host element');
  }

  return StyleSheet.flatten(root.props.style) as {
    paddingBottom?: number;
    paddingTop?: number;
  };
};

describe('SafeAreaView bottom inset', () => {
  beforeEach(() => {
    mockInsets = { top: 24, right: 0, bottom: 48, left: 0 };
  });

  it('drops the bottom inset when the navbar covers it', () => {
    // Given: a shown bottom navbar
    // When: a screen opts out of the bottom inset
    // Then: no bottom padding is added, because the bar already covers it
    renderWithNavbar({ excludeBottom: true });

    expect(paddingOf().paddingBottom).toBe(0);
  });

  it('keeps the bottom inset when the navbar moved to a side rail', () => {
    // Given: the navbar is a left rail, so nothing covers the bottom inset
    // When: a screen opts out of the bottom inset
    // Then: the inset padding is kept, otherwise content hides behind the
    // system navigation bar
    renderWithNavbar({ excludeBottom: true }, { position: 'left' });

    expect(paddingOf().paddingBottom).toBe(48);
  });

  it('keeps the bottom inset when the bottom navbar is hidden', () => {
    // Given: a bottom navbar that is toggled off, which collapses its height
    // When: a screen opts out of the bottom inset
    // Then: the inset padding is kept, because nothing covers that space anymore
    renderWithNavbar({ excludeBottom: true }, { position: 'bottom', visible: false });

    expect(paddingOf().paddingBottom).toBe(48);
  });

  it('keeps the bottom inset regardless of navbar position by default', () => {
    // Given: a screen that never opted out of the bottom inset
    // When: it renders with a side rail navbar
    // Then: the inset padding is applied as usual
    renderWithNavbar({}, { position: 'right' });

    expect(paddingOf().paddingBottom).toBe(48);
    expect(paddingOf().paddingTop).toBe(24);
  });

  it('assumes a shown bottom navbar outside the tab tree so stacked screens keep their padding', () => {
    // Given: a screen pushed above the tab navigator, where no provider exists
    // When: it renders
    // Then: it behaves as if a bottom navbar were shown
    render(
      <SafeAreaView excludeBottom>
        <></>
      </SafeAreaView>,
    );

    expect(paddingOf().paddingBottom).toBe(0);
  });
});
