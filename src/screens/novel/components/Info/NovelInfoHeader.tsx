import { Row } from '@components/Common';
import {
  NovelMetaSkeleton,
  VerticalBarSkeleton,
} from '@components/Skeleton/Skeleton';
import useLoadingColors from '@components/Skeleton/useLoadingColors';
import { ChapterInfo, NovelInfo as NovelData } from '@database/types';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { UseBooleanReturnType } from '@hooks';
import { useAppSettings } from '@hooks/persisted';
import { AVAILABLE_PLUGINS } from '@hooks/persisted/usePlugins';
import { GlobalSearchScreenProps } from '@navigators/types';
import { NovelStatus, PluginItem } from '@plugins/types';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { getString } from '@strings/translations';
import { filterColor } from '@theme/colors';
import { ThemeColors } from '@theme/types';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import { translateNovelStatus } from '@utils/translateEnum';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import NovelScreenButtonGroup from '../NovelScreenButtonGroup/NovelScreenButtonGroup';
import NovelSummary from '../NovelSummary/NovelSummary';
import {
  CoverImage,
  NovelGenres,
  NovelInfo,
  NovelInfoContainer,
  NovelTags,
  NovelThumbnail,
  NovelTitle,
} from './NovelInfoComponents';
import ReadButton from './ReadButton';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);
import { ChapterFilterKey } from '@database/constants';
import { resolveDownloadUrl } from '@utils/DownloadPaths';
import { useNovelAction } from '@screens/novel/NovelContext';

interface NovelInfoHeaderProps {
  chapters: ChapterInfo[];
  deleteDownloadSnackbar?: UseBooleanReturnType;
  fetching: boolean;
  filter?: ChapterFilterKey[];
  firstUnreadChapter?: ChapterInfo;
  isLoading: boolean;
  lastRead?: ChapterInfo;
  navigateToChapter: (chapter: ChapterInfo) => void;
  navigation: GlobalSearchScreenProps['navigation'];
  novel: NovelData | (Omit<NovelData, 'id'> & { id: 'NO_ID' });
  novelBottomSheetRef: React.RefObject<BottomSheetModalMethods | null>;
  onRefreshPage: (page: string) => void;
  page?: string;
  pageIndex: number;
  pages: string[];
  pageNavigationSheetRef: React.RefObject<BottomSheetModalMethods | null>;
  setCustomNovelCover: () => Promise<void>;
  saveNovelCover: () => Promise<void>;
  theme: ThemeColors;
  totalChapters?: number;
  trackerSheetRef: React.RefObject<BottomSheetModalMethods | null>;
}

const getStatusIcon = (status?: string) => {
  if (status === NovelStatus.Ongoing) return 'clock-outline';
  if (status === NovelStatus.Completed) return 'check-circle-outline';
  return 'help-circle-outline';
};

const ChapterCountSkeleton = ({ theme }: { theme: ThemeColors }) => {
  const sv = useSharedValue(0);
  const { disableLoadingAnimations } = useAppSettings();
  const [highlightColor, backgroundColor] = useLoadingColors(theme);

  const animatedProps = useAnimatedProps(() => ({
    left: (sv.value + '%') as `${number}%`,
  }));

  React.useEffect(() => {
    if (disableLoadingAnimations) return;
    sv.value = withRepeat(
      withSequence(0, withTiming(160, { duration: 1000 })),
      -1,
    );
  }, [disableLoadingAnimations, sv]);

  if (disableLoadingAnimations) {
    return (
      <View
        style={[styles.chapterCountSkeleton, { backgroundColor }]}
      />
    );
  }

  const LG = Animated.createAnimatedComponent(LinearGradient);
  return (
    <View style={[styles.chapterCountSkeleton, { backgroundColor }]}>
      <LG
        start={[0, 0]}
        end={[1, 0]}
        locations={[0, 0.3, 0.7, 1]}
        style={[animatedProps, styles.chapterCountGradient]}
        colors={['transparent', highlightColor, highlightColor, 'transparent']}
      />
    </View>
  );
};

const useShimmer = (theme: ThemeColors) => {
  const sv = useSharedValue(0);
  const { disableLoadingAnimations } = useAppSettings();
  const [highlightColor, backgroundColor] = useLoadingColors(theme);

  const animatedStyle = useAnimatedProps(() => ({
    left: (sv.value + '%') as `${number}%`,
  }));

  React.useEffect(() => {
    if (disableLoadingAnimations) return;
    sv.value = withRepeat(
      withSequence(0, withTiming(160, { duration: 1000 })),
      -1,
    );
  }, [disableLoadingAnimations, sv]);

  return { animatedStyle, highlightColor, backgroundColor, disableLoadingAnimations };
};

const NovelDetailsSkeleton = ({ theme }: { theme: ThemeColors }) => {
  const { animatedStyle, highlightColor, backgroundColor, disableLoadingAnimations } =
    useShimmer(theme);

  const shimmer = !disableLoadingAnimations ? (
    <AnimatedLinearGradient
      start={[0, 0]}
      end={[1, 0]}
      locations={[0, 0.3, 0.7, 1]}
      style={[animatedStyle, styles.infoSkeletonGradient]}
      colors={['transparent', highlightColor, highlightColor, 'transparent']}
    />
  ) : null;

  return (
    <>
      <Row style={styles.infoRow}>
        <View style={[styles.infoSkeletonBar, styles.w130, { backgroundColor }]}>
          {shimmer}
        </View>
      </Row>
      <Row style={styles.infoRow}>
        <View style={[styles.infoSkeletonBar, styles.w180, { backgroundColor }]}>
          {shimmer}
        </View>
      </Row>
    </>
  );
};

const ButtonGroupSkeleton = ({ theme }: { theme: ThemeColors }) => {
  const { animatedStyle, highlightColor, backgroundColor, disableLoadingAnimations } =
    useShimmer(theme);

  const shimmer = !disableLoadingAnimations ? (
    <AnimatedLinearGradient
      start={[0, 0]}
      end={[1, 0]}
      locations={[0, 0.3, 0.7, 1]}
      style={[animatedStyle, styles.buttonSkeletonGradient]}
      colors={['transparent', highlightColor, highlightColor, 'transparent']}
    />
  ) : null;

  return (
    <View style={styles.buttonGroupSkeletonContainer}>
      <View style={[styles.buttonSkeleton, { backgroundColor }]}>{shimmer}</View>
      <View style={[styles.buttonSkeleton, { backgroundColor }]}>{shimmer}</View>
    </View>
  );
};

const showNotAvailable = async () => {
  showToast('Not available while loading');
};

const NovelInfoHeader = ({
  chapters,
  deleteDownloadSnackbar,
  fetching,
  filter = [],
  firstUnreadChapter,
  isLoading = false,
  lastRead,
  navigateToChapter,
  navigation,
  novel,
  novelBottomSheetRef,
  setCustomNovelCover,
  saveNovelCover,
  theme,
  totalChapters,
  trackerSheetRef,
}: NovelInfoHeaderProps) => {
  const { hideBackdrop = false } = useAppSettings();
  const followNovel = useNovelAction('followNovel');

  const pluginName = useMemo(
    () =>
      (getMMKVObject<PluginItem[]>(AVAILABLE_PLUGINS) || []).find(
        plugin => plugin.id === novel.pluginId,
      )?.name || novel.pluginId,
    [novel.pluginId],
  );

  const coverSource = useMemo(
    () => ({ uri: resolveDownloadUrl(novel.cover) }),
    [novel.cover],
  );

  const novelStatus = useMemo(
    () => (novel.id !== 'NO_ID' ? novel.status ?? undefined : undefined),
    [novel.id, novel.status],
  );

  const handleTitlePress = useCallback(
    () =>
      navigation.replace('GlobalSearchScreen', { searchText: novel.name }),
    [navigation, novel.name],
  );

  const handleTitleLongPress = useCallback(() => {
    Clipboard.setStringAsync(novel.name).then(() =>
      showToast(getString('common.copiedToClipboard', { name: novel.name })),
    );
  }, [novel.name]);

  const handleFollowNovel = useCallback(() => {
    if (isLoading) {
      showNotAvailable();
      return;
    }
    followNovel().catch(error =>
      showToast('Failed updating: ' + (error as Error).message),
    );
    if (novel.inLibrary && chapters.some(c => c.isDownloaded)) {
      deleteDownloadSnackbar?.setTrue();
    } else {
      deleteDownloadSnackbar?.setFalse();
    }
  }, [isLoading, followNovel, novel.inLibrary, chapters, deleteDownloadSnackbar]);

  const handleTrackerSheet = useCallback(
    () => trackerSheetRef.current?.present(),
    [trackerSheetRef],
  );

  const handleOpenBottomSheet = useCallback(
    () => novelBottomSheetRef.current?.present(),
    [novelBottomSheetRef],
  );

  const ripple = useMemo(
    () => ({ color: theme.rippleColor }),
    [theme.rippleColor],
  );

  return (
    <>
      <CoverImage source={coverSource} theme={theme} hideBackdrop={hideBackdrop}>
        <NovelInfoContainer>
          <NovelThumbnail
            source={coverSource}
            theme={theme}
            setCustomNovelCover={isLoading ? showNotAvailable : setCustomNovelCover}
            saveNovelCover={isLoading ? showNotAvailable : saveNovelCover}
          />
          <View style={styles.novelDetails}>
            <NovelTitle
              theme={theme}
              onPress={handleTitlePress}
              onLongPress={handleTitleLongPress}
            >
              {novel.name}
            </NovelTitle>

            {isLoading && novel.id === 'NO_ID' ? (
              <NovelDetailsSkeleton theme={theme} />
            ) : (
              <View style={styles.metaBlock}>
                {novel.id !== 'NO_ID' && novel.author ? (
                  <NovelInfo theme={theme} icon="fountain-pen-tip">
                    {novel.author}
                  </NovelInfo>
                ) : null}
                {novel.id !== 'NO_ID' && novel.artist ? (
                  <NovelInfo theme={theme} icon="palette-outline">
                    {novel.artist}
                  </NovelInfo>
                ) : null}
                <NovelInfo theme={theme} icon={getStatusIcon(novelStatus)}>
                  {(novelStatus
                    ? translateNovelStatus(novelStatus)
                    : getString('novelScreen.unknownStatus')) +
                    ' • ' +
                    pluginName}
                </NovelInfo>
              </View>
            )}
          </View>
        </NovelInfoContainer>
      </CoverImage>

      <>
        {isLoading && novel.id === 'NO_ID' ? (
          <ButtonGroupSkeleton theme={theme} />
        ) : (
          <NovelScreenButtonGroup
            novel={novel}
            handleFollowNovel={handleFollowNovel}
            handleTrackerSheet={handleTrackerSheet}
            theme={theme}
          />
        )}

        {isLoading && (!novel.genres || !novel.summary) ? (
          <NovelMetaSkeleton />
        ) : (
          <>
            <NovelSummary
              summary={novel.summary || getString('novelScreen.noSummary')}
              isExpanded={!novel.inLibrary}
              theme={theme}
            />
            {novel.genres ? (
              <NovelGenres theme={theme} genres={novel.genres} />
            ) : null}
            {novel.tags ? (
              <NovelTags theme={theme} tags={novel.tags} />
            ) : null}
          </>
        )}

        <ReadButton
          navigateToChapter={navigateToChapter}
          firstUnreadChapter={firstUnreadChapter}
          lastRead={lastRead}
        />

        {isLoading && (!novel.genres || !novel.summary) ? (
          <VerticalBarSkeleton />
        ) : (
          <View style={styles.bottomsheetContainer}>
            <Pressable
              style={[
                styles.bottomsheet,
                { borderColor: theme.surfaceVariant },
              ]}
              onPress={handleOpenBottomSheet}
              android_ripple={ripple}
            >
              <View style={styles.flex}>
                {fetching && totalChapters === undefined ? (
                  <ChapterCountSkeleton theme={theme} />
                ) : (
                  <Text style={[{ color: theme.onSurface }, styles.chapters]}>
                    {`${totalChapters ?? 0} ${getString('novelScreen.chapters')}`}
                  </Text>
                )}
              </View>
              <View style={styles.filterBtnWrap}>
                <MaterialCommunityIcons
                  name="filter-variant"
                  size={18}
                  color={
                    filter.length > 0
                      ? filterColor(theme.isDark)
                      : theme.onSurfaceVariant
                  }
                />
                {filter.length > 0 ? (
                  <View
                    style={[
                      styles.filterDot,
                      { backgroundColor: filterColor(theme.isDark) },
                    ]}
                  />
                ) : null}
              </View>
            </Pressable>
          </View>
        )}
      </>
    </>
  );
};

export default memo(NovelInfoHeader);

const styles = StyleSheet.create({
  bottomsheet: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bottomsheetContainer: {
    marginTop: 4,
    marginBottom: 4,
  },
  chapterCountGradient: {
    height: 20,
    position: 'absolute',
    transform: [{ translateX: '-100%' }],
    width: '60%',
  },
  chapterCountSkeleton: {
    borderRadius: 4,
    height: 14,
    marginHorizontal: 16,
    overflow: 'hidden',
    width: 120,
  },
  chapters: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 0,
  },
  flex: { flex: 1 },
  filterBtnWrap: {
    position: 'relative',
    marginRight: 4,
    padding: 6,
  },
  filterDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaBlock: {
    marginTop: 10,
    gap: 2,
  },
  novelDetails: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  infoRow: { marginBottom: 6 },
  infoSkeletonBar: {
    borderRadius: 4,
    height: 14,
    overflow: 'hidden',
  },
  infoSkeletonGradient: {
    height: 20,
    position: 'absolute',
    transform: [{ translateX: '-100%' }],
    width: '60%',
  },
  buttonGroupSkeletonContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  buttonSkeleton: {
    borderRadius: 8,
    flex: 1,
    height: 52,
    overflow: 'hidden',
  },
  buttonSkeletonGradient: {
    height: 60,
    position: 'absolute',
    transform: [{ translateX: '-100%' }],
    width: '60%',
  },
  w130: { width: 130 },
  w180: { width: 180 },
});
