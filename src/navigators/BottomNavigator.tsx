import { BottomTabBar } from '@components';
import {
  type NavbarLayout,
  NavbarLayoutContext,
} from '@components/BottomTabBar/context';
import { useAppSettings, usePlugins, useTheme } from '@hooks/persisted';
import Icon from '@react-native-vector-icons/material-design-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getString } from '@strings/translations';
import { MaterialDesignIconName } from '@type/icon';
import React, { useCallback, useMemo } from 'react';

import Browse from '../screens/browse/BrowseScreen';
import History from '../screens/history/HistoryScreen';
import Library from '../screens/library/LibraryScreen';
import More from '../screens/more/MoreScreen';
import Updates from '../screens/updates/UpdatesScreen';
import { BottomNavigatorParamList } from './types';

const Tab = createBottomTabNavigator<BottomNavigatorParamList>();
const TAB_ICON_SIZE = 24;
const TAB_ICON_STYLE = {
  includeFontPadding: false,
  textAlign: 'center' as const,
  width: TAB_ICON_SIZE,
};

const BottomNavigator = () => {
  const theme = useTheme();

  const {
    showHistoryTab = true,
    showUpdatesTab = true,
    showLabelsInNav = false,
    enableAnimations = true,
    navbarPosition = 'bottom',
    navbarVisible = true,
  } = useAppSettings();

  const { filteredInstalledPlugins } = usePlugins();
  const pluginsWithUpdate = useMemo(
    () => filteredInstalledPlugins.filter(p => p.hasUpdate).length,
    [filteredInstalledPlugins],
  );

  const renderIcon = useCallback(
    ({ color, route }: { route: { name: string }; color: string }) => {
      let iconName: MaterialDesignIconName;
      switch (route.name) {
        case 'Library':
          iconName = 'bookmark-box-multiple';
          break;
        case 'Updates':
          iconName = 'alert-decagram-outline';
          break;
        case 'History':
          iconName = 'history';
          break;
        case 'Browse':
          iconName = 'compass-outline';
          break;
        case 'More':
          iconName = 'dots-horizontal';
          break;
        default:
          iconName = 'circle';
      }

      return (
        <Icon
          allowFontScaling={false}
          color={color}
          name={iconName}
          size={TAB_ICON_SIZE}
          style={TAB_ICON_STYLE}
        />
      );
    },
    [],
  );

  const renderTabBar = useCallback(
    (props: any) => (
      <BottomTabBar
        {...props}
        theme={theme}
        showLabelsInNav={showLabelsInNav}
        position={navbarPosition}
        visible={navbarVisible}
        renderIcon={renderIcon}
      />
    ),
    [theme, showLabelsInNav, navbarPosition, navbarVisible, renderIcon],
  );

  const tabBarBadgeStyle = useMemo(
    () => ({
      backgroundColor: theme.error,
      color: theme.onError,
    }),
    [theme.error, theme.onError],
  );

  // Memoized so toggling an unrelated setting does not re-render every screen
  // that reads the navbar layout through the context.
  const navbarLayout: NavbarLayout = useMemo(
    () => ({ position: navbarPosition, visible: navbarVisible }),
    [navbarPosition, navbarVisible],
  );
  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      animation: (enableAnimations ? 'shift' : 'none') as 'shift' | 'none',
      lazy: true,
      freezeOnBlur: true,
      tabBarBadgeStyle,
      // `left`/`right` switch the navigator to a row, so the rail takes its own
      // width and the screen keeps its full height instead of being overlapped.
      tabBarPosition: navbarPosition,
    }),
    [tabBarBadgeStyle, enableAnimations, navbarPosition],
  );

  return (
    <NavbarLayoutContext.Provider value={navbarLayout}>
      <Tab.Navigator screenOptions={screenOptions} tabBar={renderTabBar}>
        <Tab.Screen
          name="Library"
          component={Library}
          options={{
            title: getString('library'),
          }}
        />
        {showUpdatesTab ? (
          <Tab.Screen
            name="Updates"
            component={Updates}
            options={{
              title: getString('updates'),
            }}
          />
        ) : null}
        {showHistoryTab ? (
          <Tab.Screen
            name="History"
            component={History}
            options={{
              title: getString('history'),
            }}
          />
        ) : null}
        <Tab.Screen
          name="Browse"
          component={Browse}
          options={{
            title: getString('browse'),
            tabBarBadge: pluginsWithUpdate
              ? pluginsWithUpdate.toString()
              : undefined,
          }}
        />
        <Tab.Screen
          name="More"
          component={More}
          options={{
            title: getString('more'),
          }}
        />
      </Tab.Navigator>
    </NavbarLayoutContext.Provider>
  );
};

export default BottomNavigator;
