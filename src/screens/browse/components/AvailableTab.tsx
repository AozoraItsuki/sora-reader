import { EmptyView, IconButtonV2 } from '@components';
import { usePlugins } from '@hooks/persisted';
import { LegendList, LegendListRenderItemProps } from '@legendapp/list';
import { MoreStackScreenProps } from '@navigators/types';
import { PluginItem } from '@plugins/types';
import { useNavigation } from '@react-navigation/native';
import { getString } from '@strings/translations';
import { coverPlaceholderColor } from '@theme/colors';
import { ThemeColors } from '@theme/types';
import { getLocaleLanguageName } from '@utils/constants/languages';
import { showToast } from '@utils/showToast';
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

interface AvailableTabProps {
  searchText: string;
  theme: ThemeColors;
}
interface AvailablePluginCardProps {
  plugin: PluginItem & { header: boolean };
  theme: ThemeColors;
  installPlugin: (plugin: PluginItem) => Promise<void>;
}

const AvailablePluginCard = memo(
  ({ plugin, theme, installPlugin }: AvailablePluginCardProps) => {
    const ratio = useSharedValue(1);
    const [installing, setInstalling] = useState(false);

    const wrapStyle = useAnimatedStyle(() => ({
      height: ratio.value * 72,
      opacity: ratio.value,
      overflow: 'hidden',
    }));

    const handleInstall = useCallback(() => {
      setInstalling(true);
      installPlugin(plugin)
        .then(() => {
          ratio.value = withTiming(0, { duration: 400 });
          showToast(
            getString('browseScreen.installedPlugin', { name: plugin.name }),
          );
        })
        .catch((error: Error) => {
          setInstalling(false);
          showToast(error.message);
        });
    }, [installPlugin, plugin, ratio]);

    return (
      <Animated.View style={wrapStyle}>
        {plugin.header ? (
          <View
            style={[
              styles.langHeader,
              { borderBottomColor: theme.surfaceVariant },
            ]}
          >
            <Text style={[styles.langHeaderText, { color: theme.primary }]}>
              {getLocaleLanguageName(plugin.lang).toUpperCase()}
            </Text>
          </View>
        ) : null}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={styles.cardLeft}>
            <Image
              source={{ uri: plugin.iconUrl }}
              style={[
                styles.icon,
                { backgroundColor: coverPlaceholderColor },
              ]}
            />
            <View style={styles.cardInfo}>
              <Text
                numberOfLines={1}
                style={[styles.pluginName, { color: theme.onSurface }]}
              >
                {plugin.name}
              </Text>
              <View style={styles.metaRow}>
                <View
                  style={[
                    styles.langBadge,
                    { backgroundColor: theme.surfaceVariant },
                  ]}
                >
                  <Text
                    style={[
                      styles.langBadgeText,
                      { color: theme.onSurfaceVariant },
                    ]}
                  >
                    {getLocaleLanguageName(plugin.lang)}
                  </Text>
                </View>
                <Text
                  style={[styles.versionText, { color: theme.onSurfaceVariant }]}
                >
                  v{plugin.version}
                </Text>
              </View>
            </View>
          </View>
          <Pressable
            style={[
              styles.installBtn,
              installing
                ? { backgroundColor: theme.surfaceVariant }
                : { backgroundColor: theme.primary },
            ]}
            onPress={handleInstall}
            disabled={installing}
            android_ripple={{ color: theme.onPrimary, borderless: false }}
          >
            <MaterialCommunityIcons
              name={installing ? 'check' : 'download'}
              size={16}
              color={installing ? theme.onSurfaceVariant : theme.onPrimary}
            />
            <Text
              style={[
                styles.installBtnText,
                {
                  color: installing ? theme.onSurfaceVariant : theme.onPrimary,
                },
              ]}
            >
              {installing ? 'Added' : 'Install'}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  },
);

export const AvailableTab = memo(({ searchText, theme }: AvailableTabProps) => {
  const navigation = useNavigation<MoreStackScreenProps['navigation']>();
  const [refreshing, setRefreshing] = useState(false);
  const { filteredAvailablePlugins, refreshPlugins, installPlugin } =
    usePlugins();

  const searchedPlugins = useMemo(() => {
    let res = filteredAvailablePlugins;
    if (searchText) {
      const lower = searchText.toLocaleLowerCase();
      res = filteredAvailablePlugins.filter(
        plg =>
          plg.name.toLocaleLowerCase().includes(lower) ||
          plg.id.includes(lower),
      );
    }
    return res
      .sort((a, b) => a.lang.localeCompare(b.lang))
      .map((plg, i) => ({
        ...plg,
        header: i === 0 ? true : plg.lang !== res[i - 1].lang,
      }));
  }, [searchText, filteredAvailablePlugins]);

  const renderItem = useCallback(
    ({
      item,
    }: LegendListRenderItemProps<PluginItem & { header: boolean }>) => (
      <AvailablePluginCard
        plugin={item}
        theme={theme}
        installPlugin={installPlugin}
      />
    ),
    [theme, installPlugin],
  );

  return (
    <LegendList
      estimatedItemSize={72}
      data={searchedPlugins}
      recycleItems
      extraData={theme}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      keyExtractor={item => item.id + '_available'}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            refreshPlugins()
              .finally(() => setRefreshing(false))
              .catch(e => showToast(e));
          }}
          colors={[theme.onPrimary]}
          progressBackgroundColor={theme.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <EmptyView
            icon="(･Д･。"
            description={
              !filteredAvailablePlugins.length
                ? getString('repositories.emptyMsg')
                : 'No plugins match your search'
            }
            actions={
              !filteredAvailablePlugins.length
                ? [
                    {
                      iconName: 'cog-outline',
                      title: 'Add Repository',
                      onPress: () =>
                        navigation.navigate('MoreStack', {
                          screen: 'SettingsStack',
                          params: { screen: 'RespositorySettings' },
                        }),
                    },
                  ]
                : []
            }
            theme={theme}
          />
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
  },
  langHeader: {
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  langHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  cardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  pluginName: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  langBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  versionText: {
    fontSize: 11,
  },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    overflow: 'hidden',
  },
  installBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyWrap: {
    marginTop: 80,
  },
});
