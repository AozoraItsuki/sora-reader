import { IconButtonV2 } from '@components';
import { useNovelCoverImageSource } from '@components/novelCoverUri';
import { History, NovelInfo } from '@database/types';
import { useTheme } from '@hooks/persisted';
import { HistoryScreenProps } from '@navigators/types';
import { LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import { useNavigation } from '@react-navigation/native';
import { coverPlaceholderColor } from '@theme/colors';
import Color from 'color';
import dayjs from 'dayjs';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

interface HistoryCardProps {
  history: History;
  handleRemoveFromHistory: (chapterId: number) => void;
}

const HistoryCard: React.FC<HistoryCardProps> = ({
  history,
  handleRemoveFromHistory,
}) => {
  const theme = useTheme();
  const { navigate } = useNavigation<HistoryScreenProps['navigation']>();

  const progress = history.progress ?? 0;

  const coverImage = useNovelCoverImageSource(
    history.novelCover,
    history.pluginId
      ? { pluginId: history.pluginId, novelId: history.novelId }
      : null,
  );

  const navigateToReader = () =>
    navigate('ReaderStack', {
      screen: 'Chapter',
      params: {
        novel: {
          id: history.novelId,
          path: history.novelPath,
          name: history.novelName,
          pluginId: history.pluginId,
          isLocal: history.pluginId === LOCAL_PLUGIN_ID,
          cover: history.novelCover,
        } as NovelInfo,
        chapter: history,
      },
    });

  const navigateToNovel = () =>
    navigate('ReaderStack', {
      screen: 'Novel',
      params: {
        name: history.name,
        path: history.novelPath,
        cover: history.novelCover,
        pluginId: history.pluginId,
      },
    });

  const cardBg = Color(theme.surfaceVariant).alpha(0.55).string();
  const cardBorder = Color(theme.onSurface)
    .alpha(theme.isDark ? 0.1 : 0.07)
    .string();
  const coverBorder = Color(theme.onSurface).alpha(0.14).string();
  const coverScrim = Color(theme.scrim).alpha(0.4).string();
  // Light track over the dark cover scrim in both themes.
  const progressBarBg = Color(theme.isDark ? theme.onSurface : theme.surface)
    .alpha(0.35)
    .string();
  const progressBarFill = theme.primary;

  return (
    <Pressable
      style={[
        styles.container,
        { backgroundColor: cardBg, borderColor: cardBorder },
      ]}
      android_ripple={{ color: theme.rippleColor }}
      onPress={navigateToReader}
    >
      <Pressable
        onPress={navigateToNovel}
        style={[styles.coverWrapper, { borderColor: coverBorder }]}
      >
        <Image
          source={coverImage.source}
          onError={coverImage.onError}
          style={styles.cover}
        />
        {progress > 0 && (
          <>
            <View
              style={[styles.coverScrim, { backgroundColor: coverScrim }]}
            />
            <View
              style={[
                styles.progressBarTrack,
                { backgroundColor: progressBarBg },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: progressBarFill,
                    width: `${Math.min(progress, 100)}%`,
                  },
                ]}
              />
            </View>
          </>
        )}
      </Pressable>

      <View style={styles.detailsContainer}>
        <Text
          numberOfLines={2}
          style={[styles.novelName, { color: theme.onSurface }]}
        >
          {history.novelName}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.chapterName, { color: theme.primary }]}
        >
          {history.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: theme.onSurfaceVariant }]}>
            {dayjs(history.readTime).format('LT').toUpperCase()}
          </Text>
          {progress > 0 && (
            <>
              <View
                style={[styles.metaDot, { backgroundColor: theme.onSurfaceVariant }]}
              />
              <Text style={[styles.metaText, { color: theme.onSurfaceVariant }]}>
                {`${Math.round(progress)}%`}
              </Text>
            </>
          )}
        </View>
      </View>

      <IconButtonV2
        name="delete-outline"
        color={theme.onSurfaceVariant}
        theme={theme}
        onPress={() => handleRemoveFromHistory(history.id)}
      />
    </Pressable>
  );
};

export default HistoryCard;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 2,
    flexDirection: 'row',
    marginHorizontal: 12,
    marginVertical: 4,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cover: {
    backgroundColor: coverPlaceholderColor,
    borderRadius: 10,
    height: 80,
    width: 56,
  },
  coverScrim: {
    bottom: 0,
    height: 28,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  coverWrapper: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  chapterName: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
    marginBottom: 6,
    marginTop: 3,
  },
  detailsContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  metaDot: {
    borderRadius: 2,
    height: 4,
    marginHorizontal: 5,
    width: 4,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  metaText: {
    fontSize: 11,
    fontWeight: '600',
    includeFontPadding: false,
    letterSpacing: 0.2,
  },
  novelName: {
    fontSize: 15,
    fontWeight: '700',
    includeFontPadding: false,
    lineHeight: 19,
  },
  progressBarFill: {
    borderRadius: 2,
    height: '100%',
  },
  progressBarTrack: {
    borderRadius: 2,
    bottom: 0,
    height: 4,
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
