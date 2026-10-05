import { useNavbarLayout } from '@components/BottomTabBar/context';
import React, { memo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SafeAreaViewProps {
  children: React.ReactNode;
  excludeTop?: boolean;
  excludeBottom?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SafeAreaView: React.FC<SafeAreaViewProps> = ({
  children,
  style,
  excludeTop,
  excludeBottom,
}) => {
  const { bottom, top, right, left } = useSafeAreaInsets();
  const { position: navbarPosition, visible: navbarVisible } =
    useNavbarLayout();
  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    padding: {
      // `excludeBottom` means "the navbar already covers the bottom inset".
      // A side rail never covered it, and neither does a hidden bottom bar —
      // hiding releases the bar's own height — so in both cases the screen has
      // to keep the inset padding itself or content lands under the system
      // navigation bar.
      paddingBottom:
        excludeBottom && navbarPosition === 'bottom' && navbarVisible
          ? 0
          : bottom,
      paddingStart: left,
      paddingEnd: right,
      paddingTop: excludeTop ? 0 : top,
    },
  });
  return (
    <View style={[styles.container, styles.padding, style]}>{children}</View>
  );
};

export default memo(SafeAreaView);
