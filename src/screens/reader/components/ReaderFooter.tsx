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
import TTSTab from './ReaderBottomSheet/TTSTab';
import TranslateTab from './ReaderBottomSheet/TranslateTab';
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
  { key: 'more', label: 'Translate', icon: '🌐' },
];

const SETTINGS_PREFS: { key: string; label: string }[] = [
  { key: 'fullScreenMode', label: 'fullscreen' },
  { key: 'infiniteScroll', label: 'infiniteScroll' },
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
  const cardBg = color(theme.surfaceVariant).alpha(0.8).string();

  const toggleSetting = (key: string) => {
    setChapterGeneralSettings({ [key]: !(generalSettings as any)[key] });
  };

  const progressPercent =
    chapter.progress != null ? Math.round(chapter.progress) : null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'read':
        return (
          <View style={styles.readTab}>
            {/* Navigation row: Prev | chapter info | Next */}
            <View style={styles.navRow}>
              <Pressable
                android_ripple={rippleConfig}
                style={[
                  styles.navBtn,
                  {
                    backgroundColor: cardBg,
                    borderColor: dividerColor,
                    opacity: prevChapter ? 1 : 0.4,
                  },
                ]}
                onPress={() => navigateChapter('PREV')}
                disabled={!prevChapter}
              >
                <Text style={[styles.navBtnText, { color: theme.onSurface }]}>
                  {'< Prev'}
                </Text>
              </Pressable>

              <TouchableOpacity
                style={styles.chapterInfoCenter}
                onPress={hideHeader}
                activeOpacity={0.7}
              >
                {currentPosition && totalChapters ? (
                  <>
                    <Text style={[styles.chapterPositionBig, { color: theme.onSurface }]}>
                      {`Ch. ${currentPosition} / ${totalChapters}`}
                    </Text>
                    {progressPercent != null && (
                      <Text style={[styles.chapterPercentSub, { color: theme.onSurfaceVariant }]}>
                        {`${progressPercent}%`}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={[styles.chapterNameText, { color: theme.onSurface }]} numberOfLines={2}>
                    {chapter.name}
                  </Text>
                )}
              </TouchableOpacity>

              <Pressable
                android_ripple={rippleConfig}
                style={[
                  styles.navBtn,
                  {
                    backgroundColor: cardBg,
                    borderColor: dividerColor,
                    opacity: nextChapter ? 1 : 0.4,
                  },
                ]}
                onPress={() => navigateChapter('NEXT')}
                disabled={!nextChapter}
              >
                <Text style={[styles.navBtnText, { color: theme.onSurface }]}>
                  {'Next >'}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.rowDivider, { backgroundColor: dividerColor }]} />

            {/* Contents | Novel info */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionHalfBtn, { backgroundColor: cardBg, borderColor: dividerColor }]}
                onPress={openDrawer}
                activeOpacity={0.75}
              >
                <Text style={[styles.actionIcon, { color: theme.onSurface }]}>☰</Text>
                <Text style={[styles.actionLabel, { color: theme.onSurface }]}>Contents</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionHalfBtn, { backgroundColor: cardBg, borderColor: dividerColor }]}
                onPress={() =>
                  navigation.navigate('Novel', {
                    id: novel.id,
                    path: novel.path,
                    pluginId: novel.pluginId,
                  })
                }
                activeOpacity={0.75}
              >
                {novel.cover ? (
                  <Image source={{ uri: novel.cover }} style={styles.novelCover} resizeMode="cover" />
                ) : null}
                <View style={styles.novelTextWrap}>
                  <Text style={[styles.novelSuperLabel, { color: theme.onSurfaceVariant }]}>NOVEL</Text>
                  <Text style={[styles.novelTitle, { color: theme.onSurface }]} numberOfLines={1}>
                    {novel.name}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: theme.onSurfaceVariant }]}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.rowDivider, { backgroundColor: dividerColor }]} />

            {/* Edit Terms | Reading/Library */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionHalfBtn, { backgroundColor: cardBg, borderColor: dividerColor }]}
                onPress={() => setEditTermsVisible(true)}
                activeOpacity={0.75}
              >
                <Text style={[styles.actionIcon, { color: theme.onSurface }]}>✎</Text>
                <Text style={[styles.actionLabel, { color: theme.onSurface }]}>Edit Terms</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionHalfBtn, { backgroundColor: cardBg, borderColor: dividerColor }]}
                onPress={() => followNovel()}
                activeOpacity={0.75}
              >
                <Text style={[styles.actionIcon, { color: novel.inLibrary ? theme.primary : theme.onSurface }]}>
                  {novel.inLibrary ? '📚' : '📖'}
                </Text>
                <Text style={[styles.actionLabel, { color: novel.inLibrary ? theme.primary : theme.onSurface }]}>
                  {novel.inLibrary ? 'In Library' : 'Reading'}
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

      case 'tts':
        return (
          <View style={styles.tabScrollContent}>
            <TTSTab />
          </View>
        );

      case 'more':
        return (
          <View style={styles.tabScrollContent}>
            <TranslateTab />
          </View>
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

        {/* Tab bar */}
        <View style={[styles.tabRow, { borderTopColor: dividerColor }]}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const tabColor = isActive ? theme.primary : theme.onSurfaceVariant;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabBtn,
                  isActive && styles.tabBtnActive,
                ]}
                onPress={() => {
                  setActiveTab(tab.key as TabKey);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabIcon, { color: tabColor }]}>{tab.icon}</Text>
                <Text style={[styles.tabLabel, { color: tabColor }]}>{tab.label}</Text>
                {isActive && (
                  <View style={[styles.tabIndicator, { backgroundColor: theme.primary }]} />
                )}
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  chapterInfoCenter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  chapterPositionBig: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  chapterPercentSub: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  chapterNameText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionHalfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  novelCover: {
    width: 28,
    height: 38,
    borderRadius: 3,
  },
  novelTextWrap: {
    flex: 1,
  },
  novelSuperLabel: {
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
  },
  tabScrollContent: {
    maxHeight: 280,
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
  tabRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    position: 'relative',
  },
  tabBtnActive: {},
  tabIndicator: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 2,
    borderRadius: 1,
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
