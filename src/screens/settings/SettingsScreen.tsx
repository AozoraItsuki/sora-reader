import { Appbar, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import { SettingsScreenProps } from '@navigators/types';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { getString } from '@strings/translations';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { DiscordSVG } from './SettingsDiscordScreen';

export const AIIconSvg = ({ color, size, ...props }: any) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    width={size || 20}
    height={size || 20}
    fill={color || 'currentColor'}
    {...props}
  >
    <Path d="M32 0C32.6711 1.144e-05 33.2553 0.458263 33.4189 1.10938C33.9209 3.10093 34.5758 5.04389 35.3906 6.93359C37.5131 11.8639 40.4247 16.1796 44.1221 19.877C47.8215 23.5745 52.1357 26.4869 57.0664 28.6094C58.958 29.4242 60.899 30.0791 62.8906 30.5811C63.5415 30.7448 63.9998 31.3281 64 31.999C64 32.6701 63.5417 33.2542 62.8906 33.418C60.899 33.9199 58.9561 34.5748 57.0664 35.3896C52.1358 37.5121 47.8196 40.4237 44.1221 44.1211C40.4246 47.8204 37.5131 52.1349 35.3906 57.0654C34.5758 58.957 33.9209 60.8981 33.4189 62.8896C33.2552 63.5407 32.6711 63.999 32 63.999C31.3289 63.999 30.7448 63.5407 30.5811 62.8896C30.0791 60.8981 29.4242 58.9551 28.6094 57.0654C26.4869 52.1349 23.5773 47.8186 19.8779 44.1211C16.1786 40.4237 11.8642 37.5121 6.93359 35.3896C5.04204 34.5748 3.10096 33.9199 1.10938 33.418C0.458309 33.2542 0 32.6701 0 31.999C0.000201548 31.3281 0.458463 30.7448 1.10938 30.5811C3.10096 30.0791 5.04386 29.4242 6.93359 28.6094C11.8643 26.4869 16.1804 23.5745 19.8779 19.877C23.5753 16.1796 26.4869 11.8639 28.6094 6.93359C29.4242 5.04207 30.0791 3.10093 30.5811 1.10938C30.7448 0.45826 31.3289 0 32 0Z" />
  </Svg>
);

type SettingItem = {
  title: string;
  description: string;
  icon: string | ((props: any) => React.ReactNode);
  screen: string;
  isCustomIcon?: boolean;
};

type SettingSection = {
  sectionTitle: string;
  items: SettingItem[];
};

const SettingsScreen = ({ navigation }: SettingsScreenProps) => {
  const theme = useTheme();

  const sections: SettingSection[] = [
    {
      sectionTitle: 'General',
      items: [
        {
          title: getString('generalSettings'),
          description: 'Default chapter, sort, and library behavior',
          icon: 'tune',
          screen: 'GeneralSettings',
        },
        {
          title: getString('downloadSettings'),
          description: 'Parallel downloads, auto-download, and retry',
          icon: 'download-outline',
          screen: 'DownloadSettings',
        },
        {
          title: getString('appearance'),
          description: 'Theme, colors, and display preferences',
          icon: 'palette-outline',
          screen: 'AppearanceSettings',
        },
        {
          title: getString('readerSettings.title'),
          description: 'Font, layout, and reading options',
          icon: 'book-open-outline',
          screen: 'ReaderSettings',
        },
      ],
    },
    {
      sectionTitle: 'Features',
      items: [
        {
          title: 'AI Settings',
          description: 'Translation and AI-powered features',
          icon: 'ai',
          isCustomIcon: true,
          screen: 'AISettings',
        },
        {
          title: 'Repositories',
          description: 'Manage plugin source repositories',
          icon: 'github',
          screen: 'RespositorySettings',
        },
        {
          title: getString('termsSettings'),
          description: 'Global and per-novel text replacements',
          icon: 'format-color-highlight',
          screen: 'TermsSettings',
        },
        {
          title: getString('tracking'),
          description: 'AniList, MyAnimeList tracker sync',
          icon: 'sync',
          screen: 'TrackerSettings',
        },
      ],
    },
    {
      sectionTitle: 'System',
      items: [
        {
          title: getString('securitySettings'),
          description: 'App lock and security options',
          icon: 'shield-lock-outline',
          screen: 'SecuritySettings',
        },
        {
          title: 'Discord',
          description: 'Rich presence and Discord integration',
          icon: 'discord',
          isCustomIcon: true,
          screen: 'DiscordSettings',
        },
        {
          title: getString('common.backup'),
          description: 'Backup and restore your library',
          icon: 'cloud-upload-outline',
          screen: 'BackupSettings',
        },
        {
          title: getString('advancedSettings'),
          description: 'Developer tools and advanced options',
          icon: 'code-tags',
          screen: 'AdvancedSettings',
        },
      ],
    },
  ];

  const renderIcon = (item: SettingItem, iconColor: string) => {
    if (item.isCustomIcon) {
      if (item.icon === 'ai') {
        return <AIIconSvg color={iconColor} size={20} />;
      }
      if (item.icon === 'discord') {
        return <DiscordSVG color={iconColor} size={20} />;
      }
    }
    return (
      <MaterialCommunityIcons
        name={item.icon as any}
        size={20}
        color={iconColor}
      />
    );
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('common.settings')}
        handleGoBack={navigation.goBack}
        theme={theme}
      />
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section, sIdx) => (
          <Animated.View
            key={section.sectionTitle}
            entering={FadeInDown.delay(sIdx * 60).duration(280)}
          >
            <Text style={[styles.sectionTitle, { color: theme.primary }]}>
              {section.sectionTitle.toUpperCase()}
            </Text>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.surfaceVariant,
                },
              ]}
            >
              {section.items.map((item, iIdx) => {
                const isLast = iIdx === section.items.length - 1;
                return (
                  <React.Fragment key={item.screen}>
                    <Pressable
                      android_ripple={{ color: theme.rippleColor }}
                      style={styles.row}
                      onPress={() =>
                        navigation.navigate('SettingsStack', {
                          screen: item.screen as any,
                        })
                      }
                    >
                      <View
                        style={[
                          styles.iconWrap,
                          { backgroundColor: theme.surfaceVariant },
                        ]}
                      >
                        {renderIcon(item, theme.primary)}
                      </View>
                      <View style={styles.rowText}>
                        <Text
                          style={[styles.rowTitle, { color: theme.onSurface }]}
                        >
                          {item.title}
                        </Text>
                        <Text
                          style={[
                            styles.rowDesc,
                            { color: theme.onSurfaceVariant },
                          ]}
                          numberOfLines={1}
                        >
                          {item.description}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={theme.onSurfaceVariant}
                      />
                    </Pressable>
                    {!isLast && (
                      <View
                        style={[
                          styles.divider,
                          { backgroundColor: theme.surfaceVariant },
                        ]}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          </Animated.View>
        ))}
        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
  },
  bottomPad: { height: 24 },
});
