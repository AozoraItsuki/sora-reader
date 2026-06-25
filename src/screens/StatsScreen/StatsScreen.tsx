import {
  Appbar,
  ErrorScreenV2,
  LoadingScreenV2,
  SafeAreaView,
} from '@components';
import {
  getChaptersDownloadedCountFromDb,
  getChaptersReadCountFromDb,
  getChaptersTotalCountFromDb,
  getChaptersUnreadCountFromDb,
  getLibraryStatsFromDb,
  getNovelGenresFromDb,
  getNovelStatusFromDb,
  getTotalReadingTimeFromDb,
} from '@database/queries/StatsQueries';
import { LibraryStats } from '@database/types';
import { useTheme } from '@hooks/persisted';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getString } from '@strings/translations';
import { translateNovelStatus } from '@utils/translateEnum';
import Color from 'color';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MoreStackParamList } from '../../navigators/types';

const StatsScreen = () => {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { goBack } = navigation;

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<LibraryStats>({});
  const [error, setError] = useState<string | Error | null>(null);

  const getStats = async () => {
    try {
      const res = await Promise.all([
        getLibraryStatsFromDb(),
        getChaptersTotalCountFromDb(),
        getChaptersReadCountFromDb(),
        getChaptersUnreadCountFromDb(),
        getChaptersDownloadedCountFromDb(),
        getNovelGenresFromDb(),
        getNovelStatusFromDb(),
        getTotalReadingTimeFromDb(),
      ]);
      setStats(Object.assign(...res));
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getStats();
  }, []);

  const Header = (
    <Appbar
      title={getString('statsScreen.title')}
      handleGoBack={goBack}
      theme={theme}
    />
  );

  if (error) {
    return (
      <>
        {Header}
        <ErrorScreenV2 error={error} />
      </>
    );
  }
  if (isLoading) {
    return (
      <>
        {Header}
        <LoadingScreenV2 theme={theme} />
      </>
    );
  }

  const cardBg = Color(theme.surfaceVariant).alpha(0.5).string();
  const heroBg = Color(theme.primary).alpha(0.12).string();

  return (
    <SafeAreaView excludeTop>
      {Header}
      <ScrollView
        style={styles.screenCtn}
        contentContainerStyle={styles.contentCtn}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — Reading Time */}
        <Pressable
          style={[styles.heroCard, { backgroundColor: heroBg }]}
          onPress={() => navigation.navigate('ReadingTimeStats')}
        >
          <View style={[styles.heroIconWrap, { backgroundColor: Color(theme.primary).alpha(0.15).string() }]}>
            <MaterialCommunityIcons
              name="book-clock-outline"
              size={28}
              color={theme.primary}
            />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.heroValue, { color: theme.primary }]}>
              {formatReadingTime(stats.totalReadingTime ?? 0)}
            </Text>
            <Text style={[styles.heroLabel, { color: theme.onSurfaceVariant }]}>
              {getString('statsScreen.totalReadingTime')}
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={theme.onSurfaceVariant}
          />
        </Pressable>

        {/* Library Overview */}
        <SectionHeader label={getString('generalSettings')} theme={theme} />
        <View style={styles.grid}>
          <StatTile
            icon="book-multiple-outline"
            label={getString('statsScreen.titlesInLibrary')}
            value={stats.novelsCount}
            theme={theme}
            cardBg={cardBg}
          />
          <StatTile
            icon="check-circle-outline"
            label={getString('statsScreen.readChapters')}
            value={stats.chaptersRead}
            theme={theme}
            cardBg={cardBg}
            iconColor={theme.tertiary}
          />
          <StatTile
            icon="format-list-numbered"
            label={getString('statsScreen.totalChapters')}
            value={stats.chaptersCount}
            theme={theme}
            cardBg={cardBg}
          />
          <StatTile
            icon="book-open-page-variant-outline"
            label={getString('statsScreen.unreadChapters')}
            value={stats.chaptersUnread}
            theme={theme}
            cardBg={cardBg}
            iconColor={theme.secondary}
          />
          <StatTile
            icon="download-circle-outline"
            label={getString('statsScreen.downloadedChapters')}
            value={stats.chaptersDownloaded}
            theme={theme}
            cardBg={cardBg}
            iconColor={theme.tertiary}
          />
          <StatTile
            icon="puzzle-outline"
            label={getString('statsScreen.sources')}
            value={stats.sourcesCount}
            theme={theme}
            cardBg={cardBg}
          />
        </View>

        {/* Genre Distribution */}
        {Object.keys(stats.genres || {}).length > 0 ? (
          <>
            <SectionHeader label={getString('statsScreen.genreDistribution')} theme={theme} />
            <View style={styles.chipGrid}>
              {Object.entries(stats.genres || {}).map(([label, value]) => (
                <GenreChip
                  key={label}
                  label={label}
                  value={value as number}
                  theme={theme}
                  cardBg={cardBg}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* Status Distribution */}
        {Object.keys(stats.status || {}).length > 0 ? (
          <>
            <SectionHeader label={getString('statsScreen.statusDistribution')} theme={theme} />
            <View style={styles.chipGrid}>
              {Object.entries(stats.status || {}).map(([label, value]) => (
                <GenreChip
                  key={label}
                  label={translateNovelStatus(label)}
                  value={value as number}
                  theme={theme}
                  cardBg={cardBg}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

export default StatsScreen;

const formatReadingTime = (totalSeconds: number): string => {
  if (!totalSeconds || totalSeconds < 60) {
    return '< 1m';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const SectionHeader = ({
  label,
  theme,
}: {
  label: string;
  theme: ReturnType<typeof useTheme>;
}) => (
  <Text style={[styles.sectionHeader, { color: theme.onSurfaceVariant }]}>
    {label.toUpperCase()}
  </Text>
);

const StatTile = ({
  icon,
  label,
  value = 0,
  theme,
  cardBg,
  iconColor,
}: {
  icon: string;
  label: string;
  value?: number;
  theme: ReturnType<typeof useTheme>;
  cardBg: string;
  iconColor?: string;
}) => {
  const color = iconColor || theme.primary;
  const iconBg = Color(color).alpha(0.12).string();
  return (
    <View style={[styles.tile, { backgroundColor: cardBg }]}>
      <View style={[styles.tileIconWrap, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.tileValue, { color: theme.onSurface }]}>
        {String(value)}
      </Text>
      <Text style={[styles.tileLabel, { color: theme.onSurfaceVariant }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
};

const GenreChip = ({
  label,
  value,
  theme,
  cardBg,
}: {
  label: string;
  value: number;
  theme: ReturnType<typeof useTheme>;
  cardBg: string;
}) => (
  <View style={[styles.chip, { backgroundColor: cardBg }]}>
    <Text style={[styles.chipLabel, { color: theme.onSurface }]}>{label}</Text>
    <View style={[styles.chipBadge, { backgroundColor: Color(theme.primary).alpha(0.15).string() }]}>
      <Text style={[styles.chipBadgeText, { color: theme.primary }]}>{value}</Text>
    </View>
  </View>
);

export const StatsCard = StatTile;

const styles = StyleSheet.create({
  contentCtn: {
    paddingBottom: 48,
  },
  screenCtn: {
    paddingHorizontal: 16,
  },
  heroCard: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  heroIconWrap: {
    alignItems: 'center',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  heroText: {
    flex: 1,
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  heroLabel: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    alignItems: 'flex-start',
    borderRadius: 16,
    flex: 1,
    minWidth: '45%',
    padding: 14,
  },
  tileIconWrap: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    marginBottom: 12,
    width: 36,
  },
  tileValue: {
    fontSize: 22,
    fontWeight: '800',
    includeFontPadding: false,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  chipBadge: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chipBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
