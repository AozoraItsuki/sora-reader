import { Button } from '@components';
import ConfirmationDialog from '@components/ConfirmationDialog/ConfirmationDialog';
import { UseBooleanReturnType } from '@hooks';
import { usePlugins } from '@hooks/persisted';
import { BrowseScreenProps } from '@navigators/types';
import { LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import { PluginItem } from '@plugins/types';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import { showToast } from '@utils/showToast';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

interface PluginListItemProps {
  item: PluginItem;
  theme: ThemeColors;
  navigation: BrowseScreenProps['navigation'];
  settingsModal: UseBooleanReturnType;
  navigateToSource: (plugin: PluginItem, showLatestNovels?: boolean) => void;
  setSelectedPluginId: React.Dispatch<React.SetStateAction<string>>;
}

export const PluginListItem = memo(
  ({
    item,
    theme,
    navigation,
    settingsModal,
    navigateToSource,
    setSelectedPluginId,
  }: PluginListItemProps) => {
    const {
      uninstallPlugin,
      updatePlugin,
      togglePinPlugin,
      isPinned,
      availablePluginsSet,
    } = usePlugins();

    const isPluginPinned = isPinned(item.id);
    const isMissingFromRepo =
      item.id !== LOCAL_PLUGIN_ID && !availablePluginsSet.has(item.id);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showActions, setShowActions] = useState(false);

    const containerStyle = useMemo(
      () => [styles.card, { backgroundColor: theme.surface }],
      [theme.surface],
    );

    const handleWebviewPress = useCallback(() => {
      setShowActions(false);
      navigation.navigate('WebviewScreen', {
        name: item.name,
        url: item.site,
        pluginId: item.id,
      });
    }, [navigation, item]);

    const handlePinPress = useCallback(() => {
      setShowActions(false);
      togglePinPlugin(item.id);
      showToast(
        isPluginPinned
          ? getString('browseScreen.unpinnedPlugin', { name: item.name })
          : getString('browseScreen.pinnedPlugin', { name: item.name }),
      );
    }, [togglePinPlugin, item.id, item.name, isPluginPinned]);

    const handleDeletePress = useCallback(() => {
      setShowActions(false);
      setShowDeleteDialog(true);
    }, []);

    const handleConfirmDelete = useCallback(() => {
      uninstallPlugin(item).then(() =>
        showToast(
          getString('browseScreen.uninstalledPlugin', { name: item.name }),
        ),
      );
    }, [uninstallPlugin, item]);

    const handleSettingsPress = useCallback(() => {
      setSelectedPluginId(item.id);
      settingsModal.setTrue();
    }, [setSelectedPluginId, item.id, settingsModal]);

    const handleUpdatePress = useCallback(() => {
      updatePlugin(item)
        .then(version =>
          showToast(getString('browseScreen.updatedTo', { version })),
        )
        .catch((error: Error) => showToast(error.message));
    }, [updatePlugin, item]);

    const handleLatestPress = useCallback(() => {
      if (item.id === LOCAL_PLUGIN_ID) handleSettingsPress();
      else navigateToSource(item, true);
    }, [navigateToSource, item, handleSettingsPress]);

    const handlePress = useCallback(() => {
      if (item.id === LOCAL_PLUGIN_ID) handleSettingsPress();
      else navigateToSource(item);
    }, [navigateToSource, item, handleSettingsPress]);

    return (
      <>
        <Pressable
          style={containerStyle}
          android_ripple={{ color: theme.rippleColor }}
          onPress={handlePress}
          onLongPress={() => setShowActions(v => !v)}
        >
          {/* Main row */}
          <View style={styles.mainRow}>
            <Image
              source={{ uri: item.iconUrl }}
              style={[styles.icon, { backgroundColor: theme.surfaceVariant }]}
            />
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text
                  numberOfLines={1}
                  style={[styles.name, { color: theme.onSurface }]}
                >
                  {item.name}
                </Text>
                {isPluginPinned ? (
                  <MaterialCommunityIcons
                    name="pin"
                    size={12}
                    color={theme.primary}
                    style={styles.pinIcon}
                  />
                ) : null}
                {isMissingFromRepo ? (
                  <MaterialCommunityIcons
                    name="alert-circle-outline"
                    size={13}
                    color="#ffc107"
                    style={styles.pinIcon}
                  />
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={[styles.meta, { color: theme.onSurfaceVariant }]}
              >
                {`${item.lang}  ·  v${item.version}`}
              </Text>
            </View>

            {/* Quick actions on right */}
            <View style={styles.rightActions}>
              {(item.hasUpdate || __DEV__) && (
                <Pressable
                  style={[
                    styles.updateBadge,
                    { backgroundColor: theme.primary },
                  ]}
                  onPress={handleUpdatePress}
                  android_ripple={{ color: theme.onPrimary, borderless: false }}
                >
                  <MaterialCommunityIcons
                    name="arrow-up-circle"
                    size={14}
                    color={theme.onPrimary}
                  />
                  <Text style={[styles.updateText, { color: theme.onPrimary }]}>
                    Update
                  </Text>
                </Pressable>
              )}
              {item.id !== LOCAL_PLUGIN_ID && !item.hasUpdate ? (
                <Button
                  title={getString('browseScreen.latest')}
                  textColor={theme.primary}
                  onPress={handleLatestPress}
                />
              ) : null}
              <Pressable
                style={styles.menuBtn}
                onPress={() => setShowActions(v => !v)}
                android_ripple={{ color: theme.rippleColor, borderless: true }}
                hitSlop={8}
              >
                <MaterialCommunityIcons
                  name="dots-vertical"
                  size={20}
                  color={theme.onSurfaceVariant}
                />
              </Pressable>
            </View>
          </View>

          {/* Expanded action row */}
          {showActions ? (
            <View
              style={[
                styles.actionBar,
                { borderTopColor: theme.surfaceVariant },
              ]}
            >
              <ActionChip
                icon="earth"
                label="WebView"
                color={theme.onSurfaceVariant}
                onPress={handleWebviewPress}
                theme={theme}
              />
              <ActionChip
                icon={isPluginPinned ? 'pin-off' : 'pin'}
                label={isPluginPinned ? 'Unpin' : 'Pin'}
                color={isPluginPinned ? theme.primary : theme.onSurfaceVariant}
                onPress={handlePinPress}
                theme={theme}
              />
              {item.hasSettings ? (
                <ActionChip
                  icon="cog-outline"
                  label="Settings"
                  color={theme.onSurfaceVariant}
                  onPress={handleSettingsPress}
                  theme={theme}
                />
              ) : null}
              <ActionChip
                icon="delete-outline"
                label="Remove"
                color="#ef5350"
                onPress={handleDeletePress}
                theme={theme}
              />
            </View>
          ) : null}
        </Pressable>

        <ConfirmationDialog
          visible={showDeleteDialog}
          title={getString('common.delete')}
          message={getString('browseScreen.deletePluginMessage', {
            name: item.name,
          })}
          onSubmit={handleConfirmDelete}
          onDismiss={() => setShowDeleteDialog(false)}
          theme={theme}
        />
      </>
    );
  },
);

const ActionChip = ({
  icon,
  label,
  color,
  onPress,
  theme,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
  theme: ThemeColors;
}) => (
  <Pressable
    style={[styles.actionChip, { backgroundColor: theme.surfaceVariant }]}
    onPress={onPress}
    android_ripple={{ color: theme.rippleColor, borderless: false }}
  >
    <MaterialCommunityIcons name={icon as any} size={15} color={color} />
    <Text style={[styles.actionChipText, { color }]}>{label}</Text>
  </Pressable>
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
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  meta: {
    fontSize: 12,
  },
  pinIcon: {
    marginTop: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  updateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  updateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  menuBtn: {
    padding: 4,
  },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
