import EmptyView from '@components/EmptyView';
import { useDownload } from '@hooks/persisted';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import { showToast } from '@utils/showToast';
import React, { useEffect } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { IconButton, List } from 'react-native-paper';

interface Props {
  theme: ThemeColors;
  onCountChange: (count: number) => void;
}

const QueueTab: React.FC<Props> = ({ theme, onCountChange }) => {
  const { downloadQueue, cancelChapterDownload } = useDownload();

  useEffect(() => {
    onCountChange(downloadQueue.length);
  }, [downloadQueue.length, onCountChange]);

  return (
    <FlatList
      contentContainerStyle={styles.flatList}
      data={downloadQueue}
      keyExtractor={item => `queued${item.task.data.chapterId}`}
      renderItem={({ item }) => (
        <List.Item
          title={item.task.data.chapterName}
          description={item.task.data.novelName}
          descriptionStyle={{ color: theme.secondary }}
          right={props => (
            <IconButton
              {...props}
              icon="close"
              iconColor={theme.onSurfaceVariant}
              onPress={() => {
                cancelChapterDownload(item.task.data.chapterId);
                showToast(getString('downloadScreen.cancelled'));
              }}
            />
          )}
        />
      )}
      ListEmptyComponent={
        <EmptyView
          iconName="download-off-outline"
          description={getString('downloadScreen.noQueuedDownloads')}
        />
      }
    />
  );
};

export default QueueTab;

const styles = StyleSheet.create({
  flatList: { flexGrow: 1, paddingVertical: 8 },
});
