import { PluginItem } from '@plugins/types';
import { ThemeColors } from '@theme/types';
import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

interface PluginListItemSkeletonProps {
  item: PluginItem;
  theme: ThemeColors;
}

export const PluginListItemSkeleton = memo(
  ({ item, theme }: PluginListItemSkeletonProps) => {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <View style={styles.mainRow}>
          <Image
            source={{ uri: item.iconUrl }}
            style={[styles.icon, { backgroundColor: theme.surfaceVariant }]}
          />
          <View style={styles.info}>
            <View
              style={[
                styles.skeletonLine,
                styles.skeletonTitle,
                { backgroundColor: theme.surfaceVariant },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                styles.skeletonMeta,
                { backgroundColor: theme.surfaceVariant },
              ]}
            />
          </View>
          <View
            style={[
              styles.skeletonBtn,
              { backgroundColor: theme.surfaceVariant },
            ]}
          />
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  info: {
    flex: 1,
    gap: 6,
  },
  skeletonLine: {
    borderRadius: 4,
    height: 12,
  },
  skeletonTitle: {
    width: '55%',
  },
  skeletonMeta: {
    width: '35%',
    opacity: 0.6,
  },
  skeletonBtn: {
    width: 56,
    height: 28,
    borderRadius: 14,
    opacity: 0.7,
  },
});
