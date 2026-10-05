import { Appbar, EmptyView, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import {
  type ReadingProgressEntry,
  useReadingProgress,
} from '@hooks/persisted/useReadingProgress';
import { ProgressScreenProps } from '@navigators/types';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { getString } from '@strings/translations';
import { showToast } from '@utils/showToast';
import dayjs from 'dayjs';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Appbar as MaterialAppbar } from 'react-native-paper';

import ClearProgressDialog from './components/ClearProgressDialog';

const ProgressItem = ({
  entry,
  theme,
  onDelete,
}: {
  entry: ReadingProgressEntry;
  theme: ReturnType<typeof useTheme>;
  onDelete: (entry: ReadingProgressEntry) => void;
}) => {
  const handleDelete = useCallback(() => onDelete(entry), [entry, onDelete]);
  const progressLabel = getString('novelScreen.progress', {
    progress: entry.position,
  });
  const lastRead = dayjs(entry.updatedAt);
  const meta = [
    entry.chapterName,
    progressLabel,
    lastRead.isValid() ? lastRead.format('LL') : '',
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <Pressable
      android_ripple={{ color: theme.rippleColor }}
      style={styles.item}
      accessibilityRole="button"
      accessibilityLabel={entry.novelName}
      onPress={handleDelete}
    >
      <View style={styles.itemText}>
        <Text
          style={[styles.itemTitle, { color: theme.onSurface }]}
          numberOfLines={1}
        >
          {entry.novelName}
        </Text>
        <Text
          style={[styles.itemSubtitle, { color: theme.onSurfaceVariant }]}
          numberOfLines={1}
        >
          {meta}
        </Text>
      </View>
      <MaterialCommunityIcons
        name="delete-outline"
        size={20}
        color={theme.onSurfaceVariant}
      />
    </Pressable>
  );
};

const ProgressScreen = ({ navigation }: ProgressScreenProps) => {
  const theme = useTheme();
  const { entries, deleteProgress, clearAllProgress } = useReadingProgress();

  const [pendingDelete, setPendingDelete] =
    useState<ReadingProgressEntry | null>(null);
  const [clearAllVisible, setClearAllVisible] = useState(false);

  const renderItem = useCallback(
    ({ item }: { item: ReadingProgressEntry }) => (
      <ProgressItem
        entry={item}
        theme={theme}
        onDelete={setPendingDelete}
      />
    ),
    [theme],
  );

  const keyExtractor = useCallback(
    (item: ReadingProgressEntry) => `${item.pluginId}:${item.novelId}`,
    [],
  );

  const confirmDelete = useCallback(() => {
    if (pendingDelete) {
      deleteProgress(pendingDelete.pluginId, pendingDelete.novelId);
      showToast(getString('progressScreen.entryDeleted'));
    }
    setPendingDelete(null);
  }, [pendingDelete, deleteProgress]);

  const confirmClearAll = useCallback(() => {
    clearAllProgress();
    setClearAllVisible(false);
    showToast(getString('progressScreen.allCleared'));
  }, [clearAllProgress]);

  const ListEmptyComponent = useCallback(
    () => (
      <EmptyView
        iconName="bookmark-off-outline"
        description={getString('progressScreen.empty')}
        theme={theme}
      />
    ),
    [theme],
  );

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('progressScreen.title')}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        {entries.length > 0 ? (
          <MaterialAppbar.Action
            icon="delete-sweep"
            iconColor={theme.onSurface}
            onPress={() => setClearAllVisible(true)}
            accessibilityLabel={getString('progressScreen.clearAll')}
          />
        ) : null}
      </Appbar>
      <FlatList
        contentContainerStyle={styles.list}
        data={entries}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={<ListEmptyComponent />}
      />
      <ClearProgressDialog
        dialogVisible={pendingDelete !== null}
        hideDialog={() => setPendingDelete(null)}
        novelName={pendingDelete?.novelName}
        theme={theme}
        onSubmit={confirmDelete}
      />
      <ClearProgressDialog
        dialogVisible={clearAllVisible}
        hideDialog={() => setClearAllVisible(false)}
        theme={theme}
        onSubmit={confirmClearAll}
      />
    </SafeAreaView>
  );
};

export default ProgressScreen;

const styles = StyleSheet.create({
  list: {
    flexGrow: 1,
    paddingVertical: 8,
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemText: {
    flex: 1,
    marginRight: 12,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  itemSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});
