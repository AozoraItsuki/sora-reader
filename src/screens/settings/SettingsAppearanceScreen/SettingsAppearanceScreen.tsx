import { Appbar, SafeAreaView, SegmentedControl } from '@components';
import List from '@components/List/List';
import ColorPickerModal from '@components/ColorPickerModal/ColorPickerModal';
import type { SegmentedControlOption } from '@components/SegmentedControl';
import { ThemePicker } from '@components/ThemePicker/ThemePicker';
import { useAppSettings, useTheme } from '@hooks/persisted';
import type { NavbarPosition } from '@hooks/persisted/useSettings';
import { useCustomThemes } from '@hooks/persisted/useCustomThemes';
import { AppearanceSettingsScreenProps } from '@navigators/types';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import Color from 'color';
import React, { useMemo, useState } from 'react';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import {
  Alert,
  Appearance,
  GestureResponderEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  useMMKVBoolean,
  useMMKVNumber,
  useMMKVString,
} from 'react-native-mmkv';
import switchTheme from 'react-native-theme-switch-animation';

import SettingSwitch from '../components/SettingSwitch';
import CreateThemeModal from './CreateThemeModal';
import LanguagePickerModal from './LanguagePickerModal';

type ThemeMode = 'light' | 'dark' | 'system';

const AppearanceSettings = ({ navigation }: AppearanceSettingsScreenProps) => {
  const theme = useTheme();
  const [, setThemeId] = useMMKVNumber('APP_THEME_ID');
  const [themeMode = 'system', setThemeMode] = useMMKVString('THEME_MODE') as [
    ThemeMode,
    (mode: ThemeMode) => void,
  ];
  const [isAmoledBlack = false, setAmoledBlack] =
    useMMKVBoolean('AMOLED_BLACK');
  const [, setCustomAccentColor] = useMMKVString('CUSTOM_ACCENT_COLOR');

  const { customThemes, addCustomTheme, deleteCustomTheme } = useCustomThemes();

  const {
    showHistoryTab,
    showUpdatesTab,
    showLabelsInNav,
    navbarPosition,
    navbarVisible,
    hideBackdrop,
    useFabForContinueReading,
    setAppSettings,
  } = useAppSettings();

  const colorScheme = Appearance.getColorScheme() ?? 'light';
  const actualThemeMode: Exclude<ThemeMode, 'system'> =
    themeMode !== 'system'
      ? themeMode
      : colorScheme === 'unspecified'
      ? 'light'
      : colorScheme;

  const [accentColorModal, setAccentColorModal] = useState(false);
  const showAccentColorModal = () => setAccentColorModal(true);
  const hideAccentColorModal = () => setAccentColorModal(false);

  const [languageModal, setLanguageModal] = useState(false);
  const showLanguageModal = () => setLanguageModal(true);
  const hideLanguageModal = () => setLanguageModal(false);
  const [appLocale = ''] = useMMKVString('APP_LOCALE');

  const [createThemeModal, setCreateThemeModal] = useState(false);

  const getCurrentLanguageName = (): string => {
    if (!appLocale) {
      return getString('appearanceScreen.appLanguageDefault');
    }
    const languageMap: Record<string, string> = {
      en: 'English',
      id: 'Bahasa Indonesia',
    };
    return languageMap[appLocale] || appLocale;
  };

  const themeModeOptions: SegmentedControlOption<ThemeMode>[] = useMemo(
    () => [
      {
        value: 'system',
        label: getString('appearanceScreen.themeModeSystem'),
      },
      {
        value: 'light',
        label: getString('appearanceScreen.themeModeLight'),
      },
      {
        value: 'dark',
        label: getString('appearanceScreen.themeModeDark'),
      },
    ],
    [],
  );

  const handleModeChange = (mode: ThemeMode, event: GestureResponderEvent) => {
    setThemeMode(mode);
    event.currentTarget.measure((_x1, _y1, width, height, px, py) => {
      switchTheme({
        switchThemeFunction: () => {},
        animationConfig: {
          type: 'circular',
          duration: 400,
          startingPoint: {
            cy: py + height / 2,
            cx: px + width / 2,
          },
        },
      });
    });
  };

  const navbarPositionOptions: SegmentedControlOption<NavbarPosition>[] =
    useMemo(
      () => [
        {
          value: 'bottom',
          label: getString('appearanceScreen.navbarPositionBottom'),
        },
        {
          value: 'left',
          label: getString('appearanceScreen.navbarPositionLeft'),
        },
        {
          value: 'right',
          label: getString('appearanceScreen.navbarPositionRight'),
        },
      ],
      [],
    );

  const handleNavbarPositionChange = (position: NavbarPosition) => {
    setAppSettings({ navbarPosition: position });
  };

  const handleThemeSelect = (
    selectedTheme: ThemeColors,
    event: GestureResponderEvent,
  ) => {
    setThemeId(selectedTheme.id);
    event.currentTarget.measure((_x1, _y1, width, height, px, py) => {
      switchTheme({
        switchThemeFunction: () => {},
        animationConfig: {
          type: 'circular',
          duration: 400,
          startingPoint: {
            cy: py + height / 2,
            cx: px + width / 2,
          },
        },
      });
    });
  };

  const handleDeleteCustomTheme = (t: ThemeColors) => {
    Alert.alert(
      'Hapus Tema',
      `Hapus tema "${t.name}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => deleteCustomTheme(t.id),
        },
      ],
    );
  };

  const customThemesForMode = customThemes.filter(
    t => t.isDark === (actualThemeMode === 'dark'),
  );

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('appearance')}
        handleGoBack={navigation.goBack}
        theme={theme}
      />
      <ScrollView
        style={styles.flex1}
        contentContainerStyle={styles.scrollContent}
      >
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('appearanceScreen.appTheme')}
          </List.SubHeader>

          <View style={styles.segmentedControlContainer}>
            <SegmentedControl
              options={themeModeOptions}
              value={themeMode}
              onChange={handleModeChange}
              theme={theme}
            />
          </View>

          {/* Custom Themes: the bundled palette is only a seed, so this
              carousel is the whole theme list. */}
          <View style={styles.scrollViewContainer}>
            <ScrollView
              contentContainerStyle={[
                styles.themePickerRow,
                { backgroundColor: theme.surfaceVariant },
              ]}
              horizontal={true}
              showsHorizontalScrollIndicator={false}
            >
              {customThemesForMode.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onLongPress={() => handleDeleteCustomTheme(item)}
                  activeOpacity={0.85}
                >
                  <ThemePicker
                    horizontal
                    currentTheme={theme}
                    theme={item}
                    onPress={e => handleThemeSelect(item, e)}
                  />
                </TouchableOpacity>
              ))}
              {/* Add button */}
              <TouchableOpacity
                style={[
                  styles.addThemeBtn,
                  { borderColor: theme.outline, backgroundColor: Color(theme.primary).alpha(0.08).string() },
                ]}
                onPress={() => setCreateThemeModal(true)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="plus" size={32} color={theme.primary} />
              </TouchableOpacity>
            </ScrollView>
          </View>

          {theme.isDark ? (
            <SettingSwitch
              label={getString('appearanceScreen.pureBlackDarkMode')}
              value={isAmoledBlack}
              onPress={() => setAmoledBlack(prevVal => !prevVal)}
              theme={theme}
            />
          ) : null}
          <List.ColorItem
            title={getString('appearanceScreen.accentColor')}
            color={Color(theme.primary)}
            onPress={showAccentColorModal}
            theme={theme}
          />
          <List.Item
            title={getString('appearanceScreen.appLanguage')}
            description={getCurrentLanguageName()}
            onPress={showLanguageModal}
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('appearanceScreen.novelInfo')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('appearanceScreen.hideBackdrop')}
            value={hideBackdrop}
            onPress={() => setAppSettings({ hideBackdrop: !hideBackdrop })}
            theme={theme}
          />
          <SettingSwitch
            label={getString('advancedSettingsScreen.useFAB')}
            value={useFabForContinueReading}
            onPress={() =>
              setAppSettings({
                useFabForContinueReading: !useFabForContinueReading,
              })
            }
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('appearanceScreen.navbar')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('appearanceScreen.showNavbar')}
            value={navbarVisible}
            onPress={() => setAppSettings({ navbarVisible: !navbarVisible })}
            theme={theme}
          />
          <List.SubHeader theme={theme}>
            {getString('appearanceScreen.navbarPosition')}
          </List.SubHeader>
          <View style={styles.navbarPositionControl}>
            <SegmentedControl
              options={navbarPositionOptions}
              value={navbarPosition}
              onChange={handleNavbarPositionChange}
              theme={theme}
            />
          </View>
          <SettingSwitch
            label={getString('appearanceScreen.showUpdatesInTheNav')}
            value={showUpdatesTab}
            onPress={() => setAppSettings({ showUpdatesTab: !showUpdatesTab })}
            theme={theme}
          />
          <SettingSwitch
            label={getString('appearanceScreen.showHistoryInTheNav')}
            value={showHistoryTab}
            onPress={() => setAppSettings({ showHistoryTab: !showHistoryTab })}
            theme={theme}
          />
          <SettingSwitch
            label={getString('appearanceScreen.alwaysShowNavLabels')}
            value={showLabelsInNav}
            onPress={() =>
              setAppSettings({ showLabelsInNav: !showLabelsInNav })
            }
            theme={theme}
          />
        </List.Section>
      </ScrollView>

      <ColorPickerModal
        title={getString('appearanceScreen.accentColor')}
        visible={accentColorModal}
        closeModal={hideAccentColorModal}
        color={theme.primary}
        onSubmit={val => setCustomAccentColor(val)}
        theme={theme}
        showAccentColors={true}
      />
      <LanguagePickerModal
        visible={languageModal}
        onDismiss={hideLanguageModal}
      />
      <CreateThemeModal
        visible={createThemeModal}
        onDismiss={() => setCreateThemeModal(false)}
        onSave={input => addCustomTheme(input)}
      />
    </SafeAreaView>
  );
};

export default AppearanceSettings;

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  themePickerRow: {
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollViewContainer: {
    paddingHorizontal: 8,
  },
  segmentedControlContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navbarPositionControl: {
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  addThemeBtn: {
    width: 95,
    height: 140,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    marginBottom: 20,
  },
});
