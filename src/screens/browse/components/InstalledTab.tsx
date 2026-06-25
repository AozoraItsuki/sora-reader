import { useBoolean } from '@hooks';
import { useBrowseSettings, usePlugins } from '@hooks/persisted';
import { LegendList, LegendListRenderItemProps } from '@legendapp/list';
import { BrowseScreenProps } from '@navigators/types';
import { localPlugin } from '@plugins/local/LocalPlugin';
import { getPlugin } from '@plugins/pluginManager';
import { PluginItem } from '@plugins/types';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Portal } from 'react-native-paper';

import DiscoverCard from '../discover/DiscoverCard';
import { DeferredPluginListItem } from './DeferredPluginListItem';
import SourceSettingsModal from './Modals/SourceSettings';

interface InstalledTabProps {
  navigation: BrowseScreenProps['navigation'];
  theme: ThemeColors;
  searchText: string;
}

export const InstalledTab = memo(
  ({ navigation, theme, searchText }: InstalledTabProps) => {
    const {
      filteredInstalledPlugins,
      lastUsedPlugin,
      setLastUsedPlugin,
      pinnedPlugins,
    } = usePlugins();
    const { showMyAnimeList, showAniList } = useBrowseSettings();
    const settingsModal = useBoolean();
    const [selectedPluginId, setSelectedPluginId] = useState<string>('');

    const pluginSettings = selectedPluginId
      ? getPlugin(selectedPluginId)?.pluginSettings
      : undefined;

    const navigateToSource = useCallback(
      (plugin: PluginItem, showLatestNovels?: boolean) => {
        navigation.navigate('SourceScreen', {
          pluginId: plugin.id,
          pluginName: plugin.name,
          site: plugin.site,
          showLatestNovels,
        });
        setLastUsedPlugin(plugin);
      },
      [navigation, setLastUsedPlugin],
    );

    const { pinnedPluginsList, unpinnedPluginsList } = useMemo(() => {
      const sorted = [...filteredInstalledPlugins].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const pinned: PluginItem[] = [];
      const unpinned: PluginItem[] = [];
      sorted.forEach(plugin => {
        if (pinnedPlugins.includes(plugin.id)) pinned.push(plugin);
        else unpinned.push(plugin);
      });
      return { pinnedPluginsList: pinned, unpinnedPluginsList: unpinned };
    }, [filteredInstalledPlugins, pinnedPlugins]);

    const searchedPlugins = useMemo(() => {
      if (searchText) {
        const lower = searchText.toLocaleLowerCase();
        return [...pinnedPluginsList, ...unpinnedPluginsList].filter(
          plg =>
            plg.name.toLocaleLowerCase().includes(lower) ||
            plg.id.includes(lower),
        );
      }
      return unpinnedPluginsList;
    }, [searchText, pinnedPluginsList, unpinnedPluginsList]);

    const renderItem = useCallback(
      ({ item }: LegendListRenderItemProps<PluginItem>) => (
        <DeferredPluginListItem
          item={item}
          theme={theme}
          navigation={navigation}
          settingsModal={settingsModal}
          navigateToSource={navigateToSource}
          setSelectedPluginId={setSelectedPluginId}
        />
      ),
      [theme, navigation, navigateToSource, settingsModal],
    );

    return (
      <>
        <LegendList
          estimatedItemSize={64}
          data={searchedPlugins}
          recycleItems
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          keyExtractor={item => item.id + '_installed'}
          drawDistance={100}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {/* Discover Section */}
              {(showMyAnimeList || showAniList) && !searchText ? (
                <View style={styles.section}>
                  <SectionLabel
                    label={getString('browseScreen.discover')}
                    theme={theme}
                  />
                  {showAniList ? (
                    <DiscoverCard
                      theme={theme}
                      icon={require('../../../../assets/anilist.png')}
                      trackerName="Anilist"
                      onPress={() => navigation.navigate('BrowseAL')}
                    />
                  ) : null}
                  {showMyAnimeList ? (
                    <DiscoverCard
                      theme={theme}
                      icon={require('../../../../assets/mal.png')}
                      trackerName="MyAnimeList"
                      onPress={() => navigation.navigate('BrowseMal')}
                    />
                  ) : null}
                </View>
              ) : null}

              {/* Pinned Plugins Section */}
              {!searchText && pinnedPluginsList.length > 0 ? (
                <View style={styles.section}>
                  <SectionLabel
                    label={getString('browseScreen.pinnedPlugins')}
                    theme={theme}
                    count={pinnedPluginsList.length}
                  />
                  {pinnedPluginsList.map(plugin => (
                    <DeferredPluginListItem
                      key={plugin.id}
                      item={plugin}
                      theme={theme}
                      navigation={navigation}
                      settingsModal={settingsModal}
                      navigateToSource={navigateToSource}
                      setSelectedPluginId={setSelectedPluginId}
                    />
                  ))}
                </View>
              ) : null}

              {/* Default Sources Section */}
              {!searchText ? (
                <View style={styles.section}>
                  <SectionLabel
                    label={getString('browseScreen.defaultSources')}
                    theme={theme}
                  />
                  <DeferredPluginListItem
                    item={localPlugin}
                    theme={theme}
                    navigation={navigation}
                    settingsModal={settingsModal}
                    navigateToSource={navigateToSource}
                    setSelectedPluginId={setSelectedPluginId}
                  />
                </View>
              ) : null}

              {/* Last Used Section */}
              {!searchText &&
              lastUsedPlugin &&
              !pinnedPlugins.includes(lastUsedPlugin.id) ? (
                <View style={styles.section}>
                  <SectionLabel
                    label={getString('browseScreen.lastUsed')}
                    theme={theme}
                  />
                  <DeferredPluginListItem
                    item={lastUsedPlugin}
                    theme={theme}
                    navigation={navigation}
                    settingsModal={settingsModal}
                    navigateToSource={navigateToSource}
                    setSelectedPluginId={setSelectedPluginId}
                  />
                </View>
              ) : null}

              {/* All Installed Plugins Section header */}
              <SectionLabel
                label={
                  searchText
                    ? getString('browseScreen.searchResults')
                    : getString('browseScreen.installedPlugins')
                }
                theme={theme}
                count={searchText ? searchedPlugins.length : unpinnedPluginsList.length}
              />

              <Portal>
                <SourceSettingsModal
                  visible={settingsModal.value}
                  onDismiss={settingsModal.setFalse}
                  title={getString('browseScreen.settings.title')}
                  description={getString('browseScreen.settings.description')}
                  pluginId={selectedPluginId}
                  pluginSettings={pluginSettings}
                />
              </Portal>
            </>
          }
        />
      </>
    );
  },
);

const SectionLabel = ({
  label,
  theme,
  count,
}: {
  label: string;
  theme: ThemeColors;
  count?: number;
}) => (
  <View style={styles.sectionLabelRow}>
    <Text style={[styles.sectionLabel, { color: theme.primary }]}>
      {label.toUpperCase()}
    </Text>
    {count !== undefined ? (
      <View
        style={[styles.countBadge, { backgroundColor: theme.surfaceVariant }]}
      >
        <Text style={[styles.countText, { color: theme.onSurfaceVariant }]}>
          {count}
        </Text>
      </View>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 4,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
