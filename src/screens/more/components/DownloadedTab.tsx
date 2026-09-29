import { List } from '@components';
import EmptyView from '@components/EmptyView';
import {
  deleteChapter,
  deleteDownloads,
  getDownloadedChapters,
} from '@database/queries/ChapterQueries';
import { DownloadedChapter } from '@database/types';
import UpdateNovelCard from '@screens/updates/components/UpdateNovelCard';
import UpdatesSkeletonLoading from '@screens/updates/components/UpdatesSkeletonLoading';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import { parseChapterNumber } from '@utils/parseChapterNumber';
import { showToast } from '@utils/showToast';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import RemoveDownloadsDialog from './RemoveDownloadsDialog';

type DownloadGroup = Record<number, DownloadedChapter[]>;

interface Props {
  theme: ThemeColors;
  clearSignal: number;
  onCountChange: (count: number) => void;
}

const DownloadedTab: React.FC<Props> = ({
  theme,
  clearSignal,
  onCountChange,
}) => {
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<DownloadedChapter[]>([]);

  const [visible, setVisible] = useState(false);
  const showDialog = () => setVisible(true);
  const hideDialog = () => setVisible(false);

  const firstSignal = useRef(clearSignal);
  useEffect(() => {
    if (clearSignal !== firstSignal.current) {
      showDialog();
    }
  }, [clearSignal]);

  useEffect(() => {
    onCountChange(chapters.length);
  }, [chapters.length, onCountChange]);

  const groupUpdatesByDate = (
    localChapters: DownloadedChapter[],
  ): DownloadedChapter[][] => {
    const dateGroups = localChapters.reduce((groups, item) => {
      const { novelId } = item;
      if (!groups[novelId]) {
        groups[novelId] = [];
      }

      groups[novelId].push(item);

      return groups;
    }, {} as DownloadGroup);
    return Object.values(dateGroups);
  };

  const getChapters = async () => {
    const res = await getDownloadedChapters();
    setChapters(
      res.map(download => {
        const parsedTime = dayjs(download.releaseTime);
        return {
          ...download,
          releaseTime: parsedTime.isValid()
            ? parsedTime.format('LL')
            : download.releaseTime,
          chapterNumber: download.chapterNumber
            ? download.chapterNumber
            : parseChapterNumber(download.novelName, download.name),
        };
      }),
    );
  };

  const ListEmptyComponent = useCallback(
    () =>
      !loading ? (
        <EmptyView
          iconName="download-off-outline"
          description={getString('downloadScreen.noDownloads')}
        />
      ) : null,
    [loading],
  );

  useEffect(() => {
    getChapters().finally(() => setLoading(false));
  }, []);

  return (
    <>
      <List.InfoItem title={getString('downloadScreen.dbInfo')} theme={theme} />
      {loading ? (
        <UpdatesSkeletonLoading theme={theme} />
      ) : (
        <FlatList
          contentContainerStyle={styles.flatList}
          data={groupUpdatesByDate(chapters)}
          keyExtractor={(item, index) => 'downloadGroup' + index}
          renderItem={({ item }) => {
            return (
              <UpdateNovelCard
                onlyDownloadedChapters
                chapterList={item}
                descriptionText={getString('downloadScreen.downloadsLower')}
                deleteChapter={chapter => {
                  deleteChapter(
                    chapter.pluginId,
                    chapter.novelId,
                    chapter.id,
                  ).then(() => {
                    showToast(`${getString('common.delete')} ${chapter.name}`);
                    getChapters();
                  });
                }}
              />
            );
          }}
          ListEmptyComponent={<ListEmptyComponent />}
        />
      )}
      <RemoveDownloadsDialog
        dialogVisible={visible}
        hideDialog={hideDialog}
        onSubmit={() => {
          deleteDownloads(chapters);
          setChapters([]);
          hideDialog();
        }}
        theme={theme}
      />
    </>
  );
};

export default DownloadedTab;

const styles = StyleSheet.create({
  flatList: { flexGrow: 1, paddingVertical: 8 },
});
