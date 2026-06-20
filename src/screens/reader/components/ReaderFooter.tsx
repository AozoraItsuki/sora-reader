import { useChapterGeneralSettings, useTheme } from '@hooks/persisted';
import { ChapterScreenProps } from '@navigators/types';
import {
  useNovelActions,
  useNovelLayout,
  useNovelValue,
} from '@screens/novel/NovelContext';
import color from 'color';
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  withTiming,
} from 'react-native-reanimated';

import { useChapterContext } from '../ChapterContext';
import EditTermsModal from './EditTermsModal';
import ReaderFontPicker from './ReaderBottomSheet/ReaderFontPicker';
import ReaderTextAlignSelector from './ReaderBottomSheet/ReaderTextAlignSelector';
import ReaderThemeSelector from './ReaderBottomSheet/ReaderThemeSelector';
import ReaderValueChange from './ReaderBottomSheet/ReaderValueChange';
import TextSizeSlider from './ReaderBottomSheet/TextSizeSlider';
import { getString } from '@strings/translations';
import { StringMap } from '@strings/types';

const SCREEN_HEIGHT = Dimensions.get('screen').height;

interface ChapterFooterProps {
  readerSheetRef?: React.RefObject<unknown>;
  scrollToStart?: () => void;
  navigation: ChapterScreenProps['navigation'];
  openDrawer: () => void;
  openEditTerms: () => void;
  presentSheetAtTab: (tabIndex: number) => void;
  onApplyTerms?: () => void;
}

const fastOutSlowIn = Easing.bezier(0.4, 0.0, 0.2, 1.0);

type TabKey = 'read' | 'display' | 'settings' | 'tts' | 'more';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'read', label: 'Read', icon: '📖' },
  { key: 'display', label: 'Display', icon: 'Tt' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
  { key: 'tts', label: 'TTS', icon: '🔊' },
  { key: 'more', label: 'More', icon: '•••' },
];

const SETTINGS_PREFS: { key: string; label: string }[] = [
  { key: 'fullScreenMode', label: 'fullscreen' },
  { key: 'autoScroll', label: 'autoscroll' },
  { key: 'swipeGestures', label: 'swipeGestures' },
  { key: 'showBatteryAndTime', label: 'showBatteryAndTime' },
  { key: 'showScrollPercentage', label: 'showProgressPercentage' },
  { key: 'verticalSeekbar', label: 'verticalSeekbar' },
  { key: 'pageReader', label: 'pageReader' },
  { key: 'removeExtraParagraphSpacing', label: 'removeExtraSpacing' },
  { key: 'useVolumeButtons', label: 'volumeButtonsScroll' },
  { key: 'bionicReading', label: 'bionicReading' },
  { key: 'tapToScroll', label: 'tapToScroll' },
  { key: 'keepScreenOn', label: 'keepScreenOn' },
];

const ChapterFooter = ({
  navigation,
  openDrawer,
  presentSheetAtTab,
  onApplyTerms,
}: ChapterFooterProps) => {
  const {
    novel,
    chapter,
    nextChapter,
    prevChapter,
    navigateChapter,
    hideHeader,
  } = useChapterContext();
  const theme = useTheme();
  const { navigationBarHeight } = useNovelLayout();
  const { followNovel } = useNovelActions();
  const { setChapterGeneralSettings, ...generalSettings } = useChapterGeneralSettings();

  const chapters = useNovelValue('chapters');
  const chapterIndex = chapters.findIndex(c => c.id === chapter.id);
  const currentPosition = chapterIndex >= 0 ? chapterIndex + 1 : null;
  const totalChapters = novel.totalChapters || chapters.length || null;

  const [activeTab, setActiveTab] = useState<TabKey>('read');
  const [editTermsVisible, setEditTermsVisible] = useState(false);

  const rippleConfig = {
    color: theme.rippleColor,
    borderless: true,
    radius: 50,
  };

  const entering = () => {
    'worklet';
    const animations = {
      transform: [
        {
          translateY: withTiming(0, {
            duration: 250,
            easing: fastOutSlowIn,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
      opacity: withTiming(1, { duration: 150 }),
    };
    const initialValues = {
      transform: [{ translateY: SCREEN_HEIGHT }],
      opacity: 0,
    };
    return { initialValues, animations };
  };

  const exiting = () => {
    'worklet';
    const animations = {
      transform: [
        {
          translateY: withTiming(SCREEN_HEIGHT, {
            duration: 250,
            easing: fastOutSlowIn,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
      opacity: withTiming(0, { duration: 150 }),
    };
    const initialValues = {
      transform: [{ translateY: 0 }],
      opacity: 1,
    };
    return { initialValues, animations };
  };

  const surfaceColor = useMemo(
    () => color(theme.surface).alpha(0.97).string(),
    [theme.surface],
  );

  const dividerColor = color(theme.onSurface).alpha(0.12).string();

  const toggleSetting = (key: string) => {
    setChapterGeneralSettings({ [key]: !(generalSettings as any)[key] });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'read':
        return (
          <View style={styles.readTab}>
            {/* Chapter position */}
            <View style={styles.chapterInfoBlock}>
              <Text style={[styles.chapterPositionText, { color: theme.onSurface }]}>
                {currentPosition && totalChapters ? `${currentPosition}/${totalChapters}` : chapter.name}
              </Text>
              {chapter.progress != null && (
                <Text style={[styles.chapterPercentText, { color: theme.onSurfaceVariant }]}>
                  {`${Math.round(chapter.progress)}% read`}
                </Text>
              )}
            </View>

            <View style={[styles.readDivider, { borderTopColor: dividerColor }]} />

            {/* Contents + Novel */}
            <View style={styles.readRow}>
              <TouchableOpacity style={styles.readHalfBtn} onPress={openDrawer} activeOpacity={0.7}>
                <Text style={[styles.readHalfIcon, { color: theme.onSurface }]}>☰</Text>
                <Text style={[styles.readHalfLabel, { color: theme.onSurface }]}>Contents</Text>
              </TouchableOpacity>
              <View style={[styles.readBtnDivider, { backgroundColor: dividerColor }]} />
              <TouchableOpacity
                style={styles.readHalfBtn}
                onPress={() =>
                  navigation.navigate('Novel', {
                    id: novel.id,
                    path: novel.path,
                    pluginId: novel.pluginId,
                  })
                }
                activeOpacity={0.7}
              >
                {novel.cover ? (
                  <Image source={{ uri: novel.cover }} style={styles.novelCover} resizeMode="cover" />
                ) : null}
                <View style={styles.novelTextWrap}>
                  <Text style={[styles.novelLabel, { color: theme.onSurfaceVariant }]}>NOVEL</Text>
                  <Text style={[styles.novelTitle, { color: theme.onSurface }]} numberOfLines={1}>
                    {novel.name}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: theme.onSurfaceVariant }]}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.readDivider, { borderTopColor: dividerColor }]} />

            {/* Edit Terms + Add to Library */}
            <View style={styles.readRow}>
              <TouchableOpacity
                style={styles.readHalfBtn}
                onPress={() => setEditTermsVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.readHalfIcon, { color: theme.onSurface }]}>✎</Text>
                <Text style={[styles.readHalfLabel, { color: theme.onSurface }]}>Edit Terms</Text>
              </TouchableOpacity>
              <View style={[styles.readBtnDivider, { backgroundColor: dividerColor }]} />
              <TouchableOpacity
                style={styles.readHalfBtn}
                onPress={() => followNovel()}
                activeOpacity={0.7}
              >
                <Text style={[styles.readHalfIcon, { color: novel.inLibrary ? theme.primary : theme.onSurface }]}>
                  {novel.inLibrary ? '♥' : '♡'}
                </Text>
                <Text style={[styles.readHalfLabel, { color: novel.inLibrary ? theme.primary : theme.onSurface }]}>
                  {novel.inLibrary ? 'In Library' : '+ Add to Library'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'display':
        return (
          <ScrollView style={styles.tabScrollContent} showsVerticalScrollIndicator={false}>
            <TextSizeSlider />
            <ReaderThemeSelector />
            <ReaderTextAlignSelector />
            <ReaderValueChange
              label={getString('readerScreen.bottomSheet.lineHeight')}
              valueKey="lineHeight"
            />
            <ReaderValueChange
              label={getString('readerScreen.bottomSheet.padding')}
              valueKey="padding"
              valueChange={2}
              min={0}
              max={50}
              decimals={0}
              unit="px"
            />
            <ReaderFontPicker />
            <View style={{ height: 8 }} />
          </ScrollView>
        );

      case 'settings':
        return (
          <ScrollView style={styles.tabScrollContent} showsVerticalScrollIndicator={false}>
            {SETTINGS_PREFS.map(pref => (
              <Pressable
                key={pref.key}
                style={styles.prefRow}
                android_ripple={{ color: theme.rippleColor }}
                onPress={() => toggleSetting(pref.key)}
              >
                <Text style={[styles.prefLabel, { color: theme.onSurfaceVariant }]}>
                  {getString(`readerScreen.bottomSheet.${pref.label}` as keyof StringMap)}
                </Text>
                <Switch
                  value={!!(generalSettings as any)[pref.key]}
                  onValueChange={() => toggleSetting(pref.key)}
                  trackColor={{ true: theme.primary, false: theme.outline }}
                  thumbColor={(generalSettings as any)[pref.key] ? theme.onPrimary : theme.surfaceVariant}
                />
              </Pressable>
            ))}
            <View style={{ height: 8 }} />
          </ScrollView>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Animated.View
        entering={entering}
        exiting={exiting}
        style={[
          styles.footer,
          {
            backgroundColor: surfaceColor,
            paddingBottom: navigationBarHeight,
          },
        ]}
      >
        {/* Tab content area */}
        <View style={[styles.contentArea, { borderBottomColor: dividerColor }]}>
          {renderTabContent()}
        </View>

        {/* Nav row: Prev / chapter info / Next */}
        <View style={[styles.navRow, { borderBottomColor: dividerColor }]}>
          <Pressable
            android_ripple={rippleConfig}
            style={styles.navBtn}
            onPress={() => navigateChapter('PREV')}
            disabled={!prevChapter}
          >
            <Text
              style={[
                styles.navBtnText,
                { color: prevChapter ? theme.onSurface : color(theme.onSurface).alpha(0.38).string() },
              ]}
            >
              {'< Prev'}
            </Text>
          </Pressable>

          <TouchableOpacity style={styles.chapterInfoCenter} onPress={hideHeader} activeOpacity={0.7}>
            <Text style={[styles.chapterName, { color: theme.onSurface }]} numberOfLines={1}>
              {chapter.name}
            </Text>
            {currentPosition && totalChapters ? (
              <Text style={[styles.chapterPositionSmall, { color: theme.onSurfaceVariant }]}>
                {`${currentPosition}/${totalChapters}`}
              </Text>
            ) : null}
          </TouchableOpacity>

          <Pressable
            android_ripple={rippleConfig}
            style={styles.navBtn}
            onPress={() => navigateChapter('NEXT')}
            disabled={!nextChapter}
          >
            <Text
              style={[
                styles.navBtnText,
                { color: nextChapter ? theme.onSurface : color(theme.onSurface).alpha(0.38).string() },
              ]}
            >
              {'Next >'}
            </Text>
          </Pressable>
        </View>

        {/* Tab bar */}
        <View style={styles.tabRow}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const tabColor = isActive ? theme.primary : theme.onSurfaceVariant;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabBtn}
                onPress={() => {
                  if (tab.key === 'tts') {
                    presentSheetAtTab(2);
                  } else if (tab.key === 'more') {
                    presentSheetAtTab(3);
                  } else {
                    setActiveTab(tab.key as TabKey);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabIcon, { color: tabColor }]}>{tab.icon}</Text>
                <Text style={[styles.tabLabel, { color: tabColor }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      <EditTermsModal
        visible={editTermsVisible}
        onClose={() => setEditTermsVisible(false)}
        novelId={novel.id ?? 0}
        novelName={novel.name}
        onTermsChanged={onApplyTerms}
      />
    </>
  );
};

export default React.memo(ChapterFooter);

const styles = StyleSheet.create({
  footer: {
    bottom: 0,
    position: 'absolute',
    width: '100%',
    zIndex: 1,
  },
  contentArea: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  readTab: {
    paddingVertical: 2,
  },
  chapterInfoBlock: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  chapterPositionText: {
    fontSize: 18,
    fontWeight: '700',
  },
  chapterPercentText: {
    fontSize: 12,
    marginTop: 2,
  },
  readDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  readRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  readBtnDivider: {
    width: StyleSheet.hairlineWidth,
  },
  readHalfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  readHalfIcon: {
    fontSize: 16,
  },
  readHalfLabel: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  novelCover: {
    width: 28,
    height: 38,
    borderRadius: 3,
  },
  novelTextWrap: {
    flex: 1,
    marginLeft: 2,
  },
  novelLabel: {
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  novelTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 20,
    marginLeft: 4,
  },
  tabScrollContent: {
    maxHeight: 200,
    paddingVertical: 4,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  prefLabel: {
    flex: 1,
    fontSize: 13,
    paddingRight: 12,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  navBtn: {
    width: 80,
    alignItems: 'center',
    paddingVertical: 8,
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chapterInfoCenter: {
    flex: 1,
    alignItems: 'center',
  },
  chapterName: {
    fontSize: 12,
    fontWeight: '600',
  },
  chapterPositionSmall: {
    fontSize: 11,
    marginTop: 1,
  },
  tabRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
