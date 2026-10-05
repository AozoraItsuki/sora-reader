/* eslint-disable react-native/no-inline-styles */
import { NavbarPosition } from '@hooks/persisted/useSettings';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ThemeColors } from '@theme/types';
import Color from 'color';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_CONTENT_HEIGHT = 56;
const TAB_BAR_CONTENT_WIDTH = 72;
const TAB_ICON_CONTAINER_HEIGHT = 32;
const TAB_ICON_ACTIVE_WIDTH = 64;
const TAB_ICON_INACTIVE_WIDTH = 40;
const TAB_ICON_SLOT_SIZE = 24;
const TAB_LABEL_HEIGHT = 16;
const TAB_ICON_LABEL_GAP = 4;
const NAVBAR_ANIMATION_DURATION = 220;

interface CustomBottomTabBarProps extends BottomTabBarProps {
  theme: ThemeColors;
  showLabelsInNav: boolean;
  /** Screen edge the bar is anchored to. `left`/`right` render a vertical rail. */
  position: NavbarPosition;
  /** Whether the bar is shown. Toggling animates its size in/out. */
  visible: boolean;
  renderIcon: ({
    color,
    route,
  }: {
    route: BottomTabBarProps['state']['routes'][number];
    color: string;
  }) => React.ReactNode;
}

type TabRoute = BottomTabBarProps['state']['routes'][number];

function CustomBottomTabBar({
  navigation,
  state,
  descriptors,
  insets,
  theme,
  showLabelsInNav,
  position,
  visible,
  renderIcon,
}: CustomBottomTabBarProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const safeAreaBottom = Math.max(insets?.bottom ?? 0, safeAreaInsets.bottom);
  const safeAreaLeft = Math.max(insets?.left ?? 0, safeAreaInsets.left);
  const safeAreaRight = Math.max(insets?.right ?? 0, safeAreaInsets.right);
  const safeAreaTop = Math.max(insets?.top ?? 0, safeAreaInsets.top);
  const activeRouteKey = state.routes[state.index]?.key;
  const isVertical = position !== 'bottom';

  const visibleRoutes = useMemo(
    () =>
      state.routes.filter(route => {
        const { options } = descriptors[route.key];
        const tabBarItemStyle = StyleSheet.flatten(options.tabBarItemStyle) as
          | ViewStyle
          | undefined;

        return tabBarItemStyle?.display !== 'none';
      }),
    [descriptors, state.routes],
  );

  const transparentBg = Color(theme.primaryContainer).fade(1).rgb().toString();

  const getLabelText = useCallback(
    (route: TabRoute) => {
      if (!showLabelsInNav && route.key !== activeRouteKey) {
        return '';
      }

      const { options } = descriptors[route.key];
      const label =
        typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : typeof options.title === 'string'
          ? options.title
          : route.name;

      return label;
    },
    [activeRouteKey, descriptors, showLabelsInNav],
  );

  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: NAVBAR_ANIMATION_DURATION,
    });
  }, [progress, visible]);

  // The navigator sizes the bar as a flex sibling of the screens, so collapsing
  // the animated axis (rather than overlaying the bar) is what keeps the
  // content unobscured while it animates in or out.
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;

    if (isVertical) {
      const sideInset = position === 'left' ? safeAreaLeft : safeAreaRight;

      return {
        opacity: p,
        paddingBottom: safeAreaBottom * p,
        paddingStart: (position === 'left' ? sideInset : 0) * p,
        paddingTop: safeAreaTop * p,
        width: TAB_BAR_CONTENT_WIDTH * p,
        transform: [
          {
            translateX:
              (position === 'left' ? -1 : 1) * (1 - p) * TAB_BAR_CONTENT_WIDTH,
          },
        ],
      };
    }

    const barHeight = TAB_BAR_CONTENT_HEIGHT + safeAreaBottom;

    return {
      opacity: p,
      paddingBottom: safeAreaBottom * p,
      height: barHeight * p,
      transform: [{ translateY: (1 - p) * barHeight }],
    };
  });

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.container,
        {
          backgroundColor: theme.surface2 || theme.surface,
        },
        animatedStyle,
      ]}
    >
      <View
        style={isVertical ? styles.contentColumn : styles.contentRow}
        testID={isVertical ? 'navbar-rail' : 'navbar-bar'}
      >
        {visibleRoutes.map(route => {
          const label = getLabelText(route);
          const isFocused = route.key === activeRouteKey;
          const showLabel = Boolean((showLabelsInNav || isFocused) && label);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const iconColor = isFocused
            ? theme.onPrimaryContainer
            : theme.onSurfaceVariant;

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              style={isVertical ? styles.pressableVertical : styles.pressable}
            >
              <View style={styles.itemContent}>
                <Animated.View
                  style={[
                    styles.iconContainer,
                    {
                      width: isFocused
                        ? TAB_ICON_ACTIVE_WIDTH
                        : TAB_ICON_INACTIVE_WIDTH,
                      backgroundColor: isFocused
                        ? theme.primaryContainer
                        : transparentBg,
                      transitionProperty: ['width', 'backgroundColor'],
                      transitionDuration: 250,
                      transitionTimingFunction: 'ease-in-out',
                    },
                  ]}
                >
                  <View style={styles.iconSlot}>
                    {renderIcon({ color: iconColor, route })}
                  </View>
                </Animated.View>

                <View style={styles.labelSlot}>
                  {showLabel ? (
                    <Text
                      style={[
                        styles.label,
                        {
                          color: isFocused
                            ? theme.onSurface
                            : theme.onSurfaceVariant,
                          fontWeight: '500',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

export default CustomBottomTabBar;
export type { CustomBottomTabBarProps };

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    paddingHorizontal: 0,
  },
  contentRow: {
    // `stretch` (not `center`) so every tab fills the full bar height and keeps
    // a >= 48dp touch target; the icon/label column stays vertically centred by
    // `pressable.justifyContent`.
    alignItems: 'stretch',
    flexDirection: 'row',
    height: TAB_BAR_CONTENT_HEIGHT,
  },
  contentColumn: {
    alignItems: 'stretch',
    flex: 1,
    flexDirection: 'column',
    width: TAB_BAR_CONTENT_WIDTH,
  },
  pressable: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pressableVertical: {
    alignItems: 'center',
    flexGrow: 0,
    flexShrink: 0,
    height: TAB_BAR_CONTENT_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: '100%',
  },
  itemContent: {
    alignItems: 'center',
    height: TAB_ICON_CONTAINER_HEIGHT + TAB_ICON_LABEL_GAP + TAB_LABEL_HEIGHT,
    justifyContent: 'space-between',
  },
  iconContainer: {
    alignItems: 'center',
    borderRadius: TAB_ICON_CONTAINER_HEIGHT / 2,
    height: TAB_ICON_CONTAINER_HEIGHT,
    justifyContent: 'center',
    marginBottom: TAB_ICON_LABEL_GAP,
    overflow: 'hidden',
  },
  iconSlot: {
    alignItems: 'center',
    height: TAB_ICON_SLOT_SIZE,
    justifyContent: 'center',
    width: TAB_ICON_SLOT_SIZE,
  },
  labelSlot: {
    alignItems: 'center',
    height: TAB_LABEL_HEIGHT,
    justifyContent: 'flex-start',
  },
  label: {
    fontSize: 12,
    lineHeight: TAB_LABEL_HEIGHT,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
