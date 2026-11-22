import EmptyView from '@components/EmptyView';
import { useDownload } from '@hooks/persisted';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import ServiceManager from '@services/ServiceManager';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import { showToast } from '@utils/showToast';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton, ProgressBar } from 'react-native-paper';

interface Props {
  theme: ThemeColors;
  onCountChange: (count: number) => void;
}

const QueueTab: React.FC<Props> = ({ theme, onCountChange }) => {
  const {
    downloadQueue,
    cancelChapterDownload,
    cancelDownload,
    pauseDownload,
    resumeDownload,
  } = useDownload();
  const [isRunning, setIsRunning] = useState(ServiceManager.manager.isRunning);

  useEffect(() => {
    onCountChange(downloadQueue.length);
    if (downloadQueue.length === 0) {
      setIsRunning(false);
    }
  }, [downloadQueue.length, onCountChange]);

  const togglePauseResume = () => {
    if (isRunning) {
      pauseDownload();
      setIsRunning(false);
      showToast(getString('common.pause'));
    } else {
      resumeDownload();
      setIsRunning(true);
      showToast(getString('common.resume'));
    }
  };

  return (
    <View style={styles.container}>
      {downloadQueue.length > 0 && (
        <View
          style={[
            styles.headerBar,
            {
              backgroundColor: theme.surface2 || theme.surface,
              borderColor: theme.outlineVariant || theme.outline,
            },
          ]}
        >
          <View style={styles.headerInfo}>
            <MaterialCommunityIcons
              name="download"
              size={18}
              color={theme.primary}
            />
            <Text style={[styles.headerCount, { color: theme.onSurface }]}>
              {downloadQueue.length}{' '}
              {downloadQueue.length === 1 ? 'chapter' : 'chapters'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={[
                styles.actionChip,
                { backgroundColor: theme.surfaceVariant },
              ]}
              onPress={togglePauseResume}
              android_ripple={{ color: theme.rippleColor }}
            >
              <MaterialCommunityIcons
                name={isRunning ? 'pause' : 'play'}
                size={16}
                color={theme.primary}
              />
              <Text style={[styles.actionChipText, { color: theme.primary }]}>
                {isRunning
                  ? getString('common.pause')
                  : getString('common.resume')}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.actionChip,
                { backgroundColor: theme.surfaceVariant },
              ]}
              onPress={() => {
                cancelDownload();
                showToast(getString('downloadScreen.cancelled'));
              }}
              android_ripple={{ color: theme.rippleColor }}
            >
              <MaterialCommunityIcons
                name="close"
                size={16}
                color={theme.error || '#d32f2f'}
              />
              <Text
                style={[
                  styles.actionChipText,
                  { color: theme.error || '#d32f2f' },
                ]}
              >
                {getString('common.cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <FlatList
        contentContainerStyle={styles.flatList}
        data={downloadQueue}
        keyExtractor={item => `queued_${item.task.data.chapterId}`}
        renderItem={({ item, index }) => {
          const isCurrent = index === 0 && isRunning;
          return (
            <View
              style={[
                styles.downloadCard,
                {
                  backgroundColor: theme.surface2 || theme.surface,
                  borderColor: isCurrent
                    ? theme.primary
                    : theme.outlineVariant || theme.outline,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.textContainer}>
                  <Text
                    style={[styles.chapterName, { color: theme.onSurface }]}
                    numberOfLines={1}
                  >
                    {item.task.data.chapterName}
                  </Text>
                  <Text
                    style={[
                      styles.novelName,
                      { color: theme.onSurfaceVariant },
                    ]}
                    numberOfLines={1}
                  >
                    {item.task.data.novelName}
                  </Text>
                </View>
                <IconButton
                  icon="close"
                  size={20}
                  iconColor={theme.onSurfaceVariant}
                  onPress={() => {
                    cancelChapterDownload(item.task.data.chapterId);
                    showToast(getString('downloadScreen.cancelled'));
                  }}
                  style={styles.cancelBtn}
                />
              </View>

              {item.meta.isRunning || isCurrent ? (
                <View style={styles.progressContainer}>
                  <ProgressBar
                    indeterminate={item.meta.progress === undefined}
                    progress={item.meta.progress}
                    color={theme.primary}
                    style={[
                      styles.progressBar,
                      { backgroundColor: theme.surfaceVariant },
                    ]}
                  />
                  <Text style={[styles.statusText, { color: theme.primary }]}>
                    {item.meta.progressText || 'Downloading...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.queuedBadge}>
                  <Text
                    style={[
                      styles.queuedText,
                      { color: theme.onSurfaceVariant },
                    ]}
                  >
                    Queued
                  </Text>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyView
            iconName="download-off-outline"
            description={getString('downloadScreen.noQueuedDownloads')}
          />
        }
      />
    </View>
  );
};

export default QueueTab;

const styles = StyleSheet.create({
  container: { flex: 1 },
  flatList: { flexGrow: 1, padding: 12, paddingBottom: 32 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  downloadCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  chapterName: {
    fontSize: 14,
    fontWeight: '600',
  },
  novelName: {
    fontSize: 12,
    marginTop: 2,
  },
  cancelBtn: {
    margin: 0,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  queuedBadge: {
    marginTop: 6,
  },
  queuedText: {
    fontSize: 11,
  },
});
