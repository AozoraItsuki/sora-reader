import {
  EmptyView,
  ErrorScreenV2,
  SafeAreaView,
  SearchbarV2,
} from '@components';
import { History } from '@database/types';
import { convertDateToISOString } from '@database/utils/convertDateToISOString';
import { useBoolean, useSearch } from '@hooks';
import { useHistory, useTheme } from '@hooks/persisted';
import { HistoryScreenProps } from '@navigators/types';
import { LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import Color from 'color';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { Portal } from 'react-native-paper';

import ClearHistoryDialog from './components/ClearHistoryDialog';
import HistoryCard from './components/HistoryCard/HistoryCard';
import HistorySkeletonLoading from './components/HistorySkeletonLoading';

const HistoryScreen = ({ navigation }: HistoryScreenProps) => {
  const theme = useTheme();
  const {
    isLoading,
    history,
    clearAllHistory,
    removeChapterFromHistory,
    error,
  } = useHistory();

  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const [searchResults, setSearchResults] = useState<History[]>([]);

  const onChangeText = (text: string) => {
    setSearchText(text);
    setSearchResults(
      history.filter(item =>
        item.novelName.toLowerCase().includes(text.toLowerCase()),
      ),
    );
  };

  const groupHistoryByDate = (rawHistory: History[]) => {
    const dateGroups = rawHistory.reduce<Record<string, History[]>>(
      (groups, item) => {
        if (!item.readTime) return groups;
        const date = convertDateToISOString(item.readTime);

        if (!groups[date]) {
          groups[date] = [];
        }

        groups[date].push(item);

        return groups;
      },
      {},
    );

    const groupedHistory = Object.keys(dateGroups).map(date => {
      return {
        date,
        data: dateGroups[date],
      };
    });

    return groupedHistory;
  };

  const sections = useMemo(
    () => groupHistoryByDate(searchText ? searchResults : history),
    [searchText, searchResults, history],
  );

  const {
    value: clearHistoryDialogVisible,
    setTrue: openClearHistoryDialog,
    setFalse: closeClearHistoryDialog,
  } = useBoolean();

  useEffect(
    () =>
      navigation.addListener('tabPress', e => {
        const lastNovel = history[0];
        if (navigation.isFocused() && lastNovel) {
          e.preventDefault();

          navigation.navigate('ReaderStack', {
            screen: 'Novel',
            params: {
              name: lastNovel.novelName,
              path: lastNovel.novelPath,
              cover: lastNovel.novelCover,
              pluginId: lastNovel.pluginId,
              isLocal: lastNovel.pluginId === LOCAL_PLUGIN_ID,
            },
          });
        }
      }),
    [navigation, history],
  );

  return (
    <SafeAreaView excludeBottom>
      <SearchbarV2
        searchText={searchText}
        placeholder={getString('historyScreen.searchbar')}
        leftIcon="magnify"
        onChangeText={onChangeText}
        clearSearchbar={clearSearchbar}
        rightIcons={[
          {
            iconName: 'delete-sweep-outline',
            onPress: openClearHistoryDialog,
          },
        ]}
        theme={theme}
      />
      {isLoading ? (
        <HistorySkeletonLoading theme={theme} />
      ) : error ? (
        <ErrorScreenV2 error={error} />
      ) : (
        <>
          <SectionList
            contentContainerStyle={styles.listContainer}
            sections={sections}
            keyExtractor={(item, index) => 'history' + index}
            renderSectionHeader={({ section: { date } }) => (
              <DateChip label={dayjs(date).calendar()} theme={theme} />
            )}
            renderItem={({ item }) => (
              <HistoryCard
                history={item}
                handleRemoveFromHistory={removeChapterFromHistory}
              />
            )}
            ListEmptyComponent={
              <EmptyView
                iconName="history"
                description={getString('historyScreen.nothingReadRecently')}
                theme={theme}
              />
            }
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            windowSize={10}
            initialNumToRender={15}
          />
          <Portal>
            <ClearHistoryDialog
              visible={clearHistoryDialogVisible}
              onSubmit={clearAllHistory}
              onDismiss={closeClearHistoryDialog}
              theme={theme}
            />
          </Portal>
        </>
      )}
    </SafeAreaView>
  );
};

export default HistoryScreen;

const DateChip = ({
  label,
  theme,
}: {
  label: string;
  theme: ThemeColors;
}) => {
  const bg = Color(theme.surfaceVariant).alpha(0.8).string();
  return (
    <View style={styles.dateChipRow}>
      <View style={[styles.dateChip, { backgroundColor: bg }]}>
        <Text style={[styles.dateChipText, { color: theme.onSurfaceVariant }]}>
          {label}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dateChipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  dateChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dateChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  listContainer: {
    flexGrow: 1,
    paddingBottom: 12,
  },
});
