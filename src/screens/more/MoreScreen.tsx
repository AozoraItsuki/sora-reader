import Switch from '@components/Switch/Switch';
import { useAnimatedEntrance } from '@hooks';
import { useLibrarySettings, useTheme } from '@hooks/persisted';
import { MoreStackScreenProps } from '@navigators/types';
import ServiceManager, { BackgroundTask } from '@services/ServiceManager';
import { getString } from '@strings/translations';
import Color from 'color';
import React, { useEffect } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMMKVObject } from 'react-native-mmkv';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { MoreHeader } from './components/MoreHeader';

interface MenuItemProps {
  icon: string;
  title: string;
  description?: string;
  onPress: () => void;
  rightElement?: React.ReactNode;
  iconColor?: string;
  theme: ReturnType<typeof useTheme>;
}

const MenuItem = ({
  icon,
  title,
  description,
  onPress,
  rightElement,
  iconColor,
  theme,
}: MenuItemProps) => {
  const iconBg = Color(iconColor || theme.primary)
    .alpha(0.12)
    .string();
  return (
    <Pressable
      android_ripple={{ color: theme.rippleColor }}
      style={styles.menuItem}
      onPress={onPress}
    >
      <View style={[styles.iconBubble, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={18}
          color={iconColor || theme.primary}
        />
      </View>
      <View style={styles.menuItemText}>
        <Text style={[styles.menuItemTitle, { color: theme.onSurface }]}>
          {title}
        </Text>
        {description ? (
          <Text
            style={[
              styles.menuItemDescription,
              { color: theme.onSurfaceVariant },
            ]}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {rightElement || (
        <MaterialCommunityIcons
          name="chevron-right"
          size={18}
          color={theme.onSurfaceVariant}
          style={styles.chevron}
        />
      )}
    </Pressable>
  );
};

const SectionCard = ({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}) => {
  const cardBg = Color(theme.surfaceVariant).alpha(0.4).string();
  return (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: cardBg, borderColor: Color(theme.onSurface).alpha(0.06).string() },
      ]}
    >
      {children}
    </View>
  );
};

const Separator = ({ theme }: { theme: ReturnType<typeof useTheme> }) => (
  <View
    style={[
      styles.separator,
      { backgroundColor: Color(theme.onSurface).alpha(0.08).string() },
    ]}
  />
);

const MoreScreen = ({ navigation }: MoreStackScreenProps) => {
  const theme = useTheme();
  const { opacity, translateY } = useAnimatedEntrance({
    duration: 320,
    fromY: 20,
  });
  const [taskQueue] = useMMKVObject<BackgroundTask[]>(
    ServiceManager.manager.STORE_KEY,
  );
  const {
    incognitoMode = false,
    downloadedOnlyMode = false,
    setLibrarySettings,
  } = useLibrarySettings();
  const { bottom } = useSafeAreaInsets();

  const enableDownloadedOnlyMode = () =>
    setLibrarySettings({ downloadedOnlyMode: !downloadedOnlyMode });

  const enableIncognitoMode = () => {
    setLibrarySettings({ incognitoMode: !incognitoMode });
  };

  useEffect(
    () =>
      navigation.addListener('tabPress', e => {
        if (navigation.isFocused()) {
          e.preventDefault();
          navigation.navigate('MoreStack', {
            screen: 'SettingsStack',
            params: { screen: 'Settings' },
          });
        }
      }),
    [navigation],
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <Animated.ScrollView
        style={{ opacity, transform: [{ translateY }] }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <MoreHeader title="" navigation={navigation} theme={theme} />

        {/* Quick Toggles */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
          Quick Settings
        </Text>
        <SectionCard theme={theme}>
          <MenuItem
            icon="cloud-off-outline"
            title={getString('moreScreen.downloadOnly')}
            description={getString('moreScreen.downloadOnlyDesc')}
            onPress={enableDownloadedOnlyMode}
            iconColor={theme.tertiary}
            theme={theme}
            rightElement={
              <Switch
                value={downloadedOnlyMode}
                onValueChange={enableDownloadedOnlyMode}
              />
            }
          />
          <Separator theme={theme} />
          <MenuItem
            icon="glasses"
            title={getString('moreScreen.incognitoMode')}
            description={getString('moreScreen.incognitoModeDesc')}
            onPress={enableIncognitoMode}
            iconColor={theme.secondary}
            theme={theme}
            rightElement={
              <Switch
                value={incognitoMode}
                onValueChange={enableIncognitoMode}
              />
            }
          />
        </SectionCard>

        {/* Library Tools */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
          Library
        </Text>
        <SectionCard theme={theme}>
          <MenuItem
            icon="progress-download"
            title={'Task Queue'}
            description={
              taskQueue && taskQueue.length > 0
                ? taskQueue.length + ' tasks remaining'
                : 'No active tasks'
            }
            onPress={() =>
              navigation.navigate('MoreStack', { screen: 'TaskQueue' })
            }
            theme={theme}
          />
          <Separator theme={theme} />
          <MenuItem
            icon="folder-download"
            title={getString('common.downloads')}
            onPress={() =>
              navigation.navigate('MoreStack', { screen: 'Downloads' })
            }
            theme={theme}
          />
          <Separator theme={theme} />
          <MenuItem
            icon="bookmark-check-outline"
            title={getString('progressScreen.title')}
            description={getString('progressScreen.description')}
            onPress={() =>
              navigation.navigate('MoreStack', { screen: 'Progress' })
            }
            theme={theme}
          />
          <Separator theme={theme} />
          <MenuItem
            icon="label-outline"
            title={getString('common.categories')}
            onPress={() =>
              navigation.navigate('MoreStack', { screen: 'Categories' })
            }
            theme={theme}
          />
          <Separator theme={theme} />
          <MenuItem
            icon="chart-line"
            title={getString('statsScreen.title')}
            onPress={() =>
              navigation.navigate('MoreStack', { screen: 'Statistics' })
            }
            theme={theme}
          />
        </SectionCard>

        {/* App */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
          App
        </Text>
        <SectionCard theme={theme}>
          <MenuItem
            icon="cog-outline"
            title={getString('common.settings')}
            onPress={() =>
              navigation.navigate('MoreStack', {
                screen: 'SettingsStack',
                params: { screen: 'Settings' },
              })
            }
            theme={theme}
          />
          <Separator theme={theme} />
          <MenuItem
            icon="information-outline"
            title={getString('common.about')}
            onPress={() =>
              navigation.navigate('MoreStack', { screen: 'About' })
            }
            theme={theme}
          />
        </SectionCard>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

export default MoreScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 4,
    marginTop: 20,
    textTransform: 'uppercase',
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
  menuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  iconBubble: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  menuItemText: {
    flex: 1,
    marginLeft: 12,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  menuItemDescription: {
    fontSize: 12,
    marginTop: 1,
  },
  chevron: {
    marginLeft: 4,
  },
});
