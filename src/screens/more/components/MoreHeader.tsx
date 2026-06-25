import { ThemeColors } from '@theme/types';
import Color from 'color';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MoreHeaderProps {
  title: string;
  navigation: any;
  theme: ThemeColors;
  goBack?: boolean;
}

export const MoreHeader = ({ theme }: MoreHeaderProps) => {
  const { top } = useSafeAreaInsets();
  const accentBg = Color(theme.primary).alpha(0.12).string();

  return (
    <View style={[styles.container, { paddingTop: top + 16 }]}>
      <View style={[styles.badge, { backgroundColor: accentBg }]}>
        <Text style={[styles.badgeText, { color: theme.primary }]}>
          SORA
        </Text>
      </View>
      <Text style={[styles.title, { color: theme.onSurface }]}>
        Sora Reader
      </Text>
      <Text style={[styles.subtitle, { color: theme.onSurfaceVariant }]}>
        Your personal novel companion
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  container: {
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
    opacity: 0.75,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
