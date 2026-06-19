import { useTheme } from '@hooks/persisted';
import { ChapterScreenProps } from '@navigators/types';
import { useNovelActions, useNovelLayout } from '@screens/novel/NovelContext';
import color from 'color';
import React, { useMemo } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
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

const SCREEN_HEIGHT = Dimensions.get('screen').height;

interface ChapterFooterProps {
  readerSheetRef?: React.RefObject<unknown>;
  scrollToStart?: () => void;
  navigation: ChapterScreenProps['navigation'];
  openDrawer: () => void;
  openEditTerms: () => void;
  presentSheetAtTab: (tabIndex: number) => void;
}

const fastOutSlowIn = Easing.bezier(0.4, 0.0, 0.2, 1.0);

// Tab index constants for reader bottom sheet
const TAB_DISPLAY = 0;
const TAB_SETTINGS = 1;
const TAB_SPEECH = 2;
const TAB_TRANSLATE = 3;

const ChapterFooter = ({
  navigation,
  openDrawer,
  openEditTerms,
  presentSheetAtTab,
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
    () => color(theme.surface).alpha(0.96).string(),
    [theme.surface],
  );

  const dividerColor = color(theme.onSurface).alpha(0.12).string();

  const handleAddToLibrary = () => {
    followNovel();
  };

  const progressText = chapter.progress != null ? `${Math.round(chapter.progress)}%` : '';

  return (
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
      {/* Row 1 — Navigation */}
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

        <View style={styles.chapterInfo}>
          <Text style={[styles.chapterName, { color: theme.onSurface }]} numberOfLines={1}>
            {chapter.name}
          </Text>
          {progressText ? (
            <Text style={[styles.chapterProgress, { color: theme.onSurfaceVariant }]}>
              {progressText}
            </Text>
          ) : null}
        </View>

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

      {/* Row 2 — Contents + Novel info */}
      <View style={[styles.infoRow, { borderBottomColor: dividerColor }]}>
        <TouchableOpacity
          style={[styles.halfBtn, { borderRightColor: dividerColor }]}
          onPress={openDrawer}
          activeOpacity={0.7}
        >
          <Text style={[styles.halfBtnIcon, { color: theme.onSurface }]}>☰</Text>
          <Text style={[styles.halfBtnLabel, { color: theme.onSurface }]}>Contents</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.halfBtn}
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
            <Image
              source={{ uri: novel.cover }}
              style={styles.novelCover}
              resizeMode="cover"
            />
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

      {/* Row 3 — Edit Terms + Add to Library */}
      <View style={[styles.infoRow, { borderBottomColor: dividerColor }]}>
        <TouchableOpacity
          style={[styles.halfBtn, { borderRightColor: dividerColor }]}
          onPress={openEditTerms}
          activeOpacity={0.7}
        >
          <Text style={[styles.halfBtnIcon, { color: theme.onSurface }]}>✎</Text>
          <Text style={[styles.halfBtnLabel, { color: theme.onSurface }]}>Edit Terms</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.halfBtn}
          onPress={handleAddToLibrary}
          activeOpacity={0.7}
        >
          <Text style={[styles.halfBtnIcon, { color: novel.inLibrary ? theme.primary : theme.onSurface }]}>
            {novel.inLibrary ? '♥' : '♡'}
          </Text>
          <Text style={[styles.halfBtnLabel, { color: novel.inLibrary ? theme.primary : theme.onSurface }]}>
            {novel.inLibrary ? 'In Library' : '+ Add to Library'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Row 4 — Tab bar */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={styles.tabBtn} onPress={hideHeader} activeOpacity={0.7}>
          <Text style={[styles.tabIcon, { color: theme.primary }]}>📖</Text>
          <Text style={[styles.tabLabel, { color: theme.primary }]}>Read</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => presentSheetAtTab(TAB_DISPLAY)}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, { color: theme.onSurfaceVariant }]}>Tt</Text>
          <Text style={[styles.tabLabel, { color: theme.onSurfaceVariant }]}>Display</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => presentSheetAtTab(TAB_SPEECH)}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, { color: theme.onSurfaceVariant }]}>🔊</Text>
          <Text style={[styles.tabLabel, { color: theme.onSurfaceVariant }]}>Speech</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => presentSheetAtTab(TAB_SETTINGS)}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, { color: theme.onSurfaceVariant }]}>⚙</Text>
          <Text style={[styles.tabLabel, { color: theme.onSurfaceVariant }]}>Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => presentSheetAtTab(TAB_TRANSLATE)}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabIcon, { color: theme.onSurfaceVariant }]}>•••</Text>
          <Text style={[styles.tabLabel, { color: theme.onSurfaceVariant }]}>More</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
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
  chapterInfo: {
    flex: 1,
    alignItems: 'center',
  },
  chapterName: {
    fontSize: 13,
    fontWeight: '600',
  },
  chapterProgress: {
    fontSize: 11,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  halfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  halfBtnIcon: {
    fontSize: 16,
  },
  halfBtnLabel: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  novelCover: {
    width: 32,
    height: 44,
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
