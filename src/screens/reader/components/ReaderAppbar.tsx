import { bookmarkChapter } from '@database/queries/ChapterQueries';
import { useNovelLayout } from '@screens/novel/NovelContext';
import { ThemeColors } from '@theme/types';
import color from 'color';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  withTiming,
} from 'react-native-reanimated';

import { IconButtonV2 } from '../../../components';
import { useChapterContext } from '../ChapterContext';

interface ReaderAppbarProps {
  theme: ThemeColors;
  goBack: () => void;
  bookmarked: boolean;
  setBookmarked: React.Dispatch<React.SetStateAction<boolean>>;
  locked: boolean;
  onToggleLock: () => void;
}

const fastOutSlowIn = Easing.bezier(0.4, 0.0, 0.2, 1.0);

const ReaderAppbar = ({
  goBack,
  theme,
  bookmarked,
  setBookmarked,
  locked,
  onToggleLock,
}: ReaderAppbarProps) => {
  const {
    chapter,
    novel,
    translateChapter,
    isTranslated,
    isTranslating,
    isOfflineTranslated,
  } = useChapterContext();
  const { statusBarHeight } = useNovelLayout();

  const entering = () => {
    'worklet';
    const animations = {
      originY: withTiming(0, {
        duration: 250,
        easing: fastOutSlowIn,
        reduceMotion: ReduceMotion.System,
      }),
      opacity: withTiming(1, { duration: 150 }),
    };
    const initialValues = {
      originY: -statusBarHeight,
      opacity: 0,
    };
    return { initialValues, animations };
  };

  const exiting = () => {
    'worklet';
    const animations = {
      originY: withTiming(-statusBarHeight, {
        duration: 250,
        easing: fastOutSlowIn,
        reduceMotion: ReduceMotion.System,
      }),
      opacity: withTiming(0, { duration: 150 }),
    };
    const initialValues = {
      originY: 0,
      opacity: 1,
    };
    return { initialValues, animations };
  };

  const getTranslateIconName = () => {
    if (isTranslating) return 'translate';
    if (isTranslated) return 'translate-off';
    return 'translate';
  };

  const getTranslateIconColor = () => {
    if (isOfflineTranslated) return color(theme.onSurface).alpha(0.38).string();
    if (isTranslating) return theme.primary;
    if (isTranslated) return theme.primary;
    return theme.onSurface;
  };

  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      style={[
        styles.container,
        {
          paddingTop: statusBarHeight + 2,
          backgroundColor: color(theme.surface).alpha(0.94).string(),
          borderBottomColor: color(theme.onSurface).alpha(0.08).string(),
        },
      ]}
    >
      <View style={styles.appbar}>
        <IconButtonV2
          name="arrow-left"
          onPress={goBack}
          color={theme.onSurface}
          size={20}
          padding={6}
          theme={theme}
        />

        <View style={styles.content}>
          <Text
            style={[styles.novelLabel, { color: theme.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {novel.name}
          </Text>
          <Text
            style={[styles.chapterTitle, { color: theme.onSurface }]}
            numberOfLines={1}
          >
            {chapter.name}
          </Text>
        </View>

        <IconButtonV2
          name={getTranslateIconName()}
          size={19}
          padding={6}
          onPress={() => {
            if (!isOfflineTranslated) translateChapter();
          }}
          color={getTranslateIconColor()}
          theme={theme}
          disabled={isOfflineTranslated}
        />

        <IconButtonV2
          name={locked ? 'lock' : 'lock-open-outline'}
          size={19}
          padding={6}
          onPress={onToggleLock}
          color={locked ? theme.primary : theme.onSurface}
          theme={theme}
        />

        <IconButtonV2
          name={bookmarked ? 'bookmark' : 'bookmark-outline'}
          size={20}
          padding={6}
          onPress={() => {
            bookmarkChapter(chapter.id).then(() => setBookmarked(!bookmarked));
          }}
          color={bookmarked ? theme.primary : theme.onSurface}
          theme={theme}
          style={styles.bookmark}
        />
      </View>
    </Animated.View>
  );
};

export default ReaderAppbar;

const styles = StyleSheet.create({
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    minHeight: 40,
  },
  bookmark: {
    marginEnd: 4,
  },
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 3,
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  novelLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
    opacity: 0.7,
    lineHeight: 12,
  },
  chapterTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 1,
  },
});
