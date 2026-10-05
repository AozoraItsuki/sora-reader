import type { NavbarPosition } from '@hooks/persisted/useSettings';
import { createContext, useContext } from 'react';

export interface NavbarLayout {
  position: NavbarPosition;
  /** Whether the bar is currently shown. A hidden bar releases its own space. */
  visible: boolean;
}

/**
 * Layout of the app navigation bar, published by the bottom tab navigator so
 * anything rendered inside the tab tree can adapt its insets.
 *
 * Defaults to a visible bottom bar so screens mounted outside the tab tree
 * (settings, reader, ...) keep the classic "the bar handles the bottom inset"
 * behaviour.
 */
export const NavbarLayoutContext = createContext<NavbarLayout>({
  position: 'bottom',
  visible: true,
});

export const useNavbarLayout = (): NavbarLayout => useContext(NavbarLayoutContext);

export const useNavbarPosition = (): NavbarPosition =>
  useNavbarLayout().position;

export const useNavbarVisible = (): boolean => useNavbarLayout().visible;
