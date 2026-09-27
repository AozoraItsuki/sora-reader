import { getNovelDownloadedChapters } from '@database/queries/ChapterQueries';
import { NovelInfo } from '@database/types';
import { useTheme } from '@hooks/persisted';
import { sanitizeChapterText } from '@screens/reader/utils/sanitizeChapterText';
import {
  dropMissingChapterImages,
  readDownloadedChapterHtml,
} from '@services/export/chapterAssets';
import PdfBuilder from '@services/export/PdfBuilder';
import { getString } from '@strings/translations';
import { chapterIndexRel } from '@utils/DownloadPaths';
import { showToast } from '@utils/showToast';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FileViewer from 'react-native-file-viewer';
import { Portal } from 'react-native-paper';
import { errorCodes, isErrorWithCode } from '@react-native-documents/picker';
import { LogViewer, Modal } from '@components';
import { BaseLogEntry } from '@components/LogViewer';

interface ExportPdfLogsModalProps {
  visible: boolean;
  onDismiss: () => void;
  novel: NovelInfo;
  startChapter?: number;
  endChapter?: number;
  pdfStylesheet?: string;
}

/** How often the chapter loop hands control back to the UI thread. */
const YIELD_EVERY = 10;

export default function ExportPdfLogsModal({
  visible,
  onDismiss,
  novel,
  startChapter,
  endChapter,
  pdfStylesheet,
}: ExportPdfLogsModalProps) {
  const theme = useTheme();

  const [isExporting, setIsExporting] = useState(false);
  const [logs, setLogs] = useState<BaseLogEntry[]>([]);

  // Ref to handle cancellation inside the async loop
  const isCancelledRef = useRef(false);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [
      ...prev,
      {
        id: `${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .substring(2)}`,
        message: msg,
        timestamp: new Date(),
        level: 'info',
      },
    ]);
  }, []);

  const handleDismiss = useCallback(() => {
    if (isExporting) {
      isCancelledRef.current = true;
    } else {
      onDismiss();
      setTimeout(() => {
        setLogs([]);
      }, 500);
    }
  }, [isExporting, onDismiss]);

  const startExport = useCallback(async () => {
    if (!novel) return;

    setIsExporting(true);
    isCancelledRef.current = false;
    setLogs([]);
    addLog(getString('novelScreen.exportPdfLogsModal.logStart'));

    let pdf: PdfBuilder | undefined;

    try {
      addLog(getString('novelScreen.exportPdfLogsModal.logFetchChapters'));
      const chapters = await getNovelDownloadedChapters(
        novel.id,
        startChapter,
        endChapter,
      );

      if (chapters.length === 0) {
        addLog(getString('novelScreen.exportPdfLogsModal.logNoChapters'));
        setIsExporting(false);
        return;
      }

      addLog(getString('novelScreen.exportPdfLogsModal.logPreparing'));
      pdf = await new PdfBuilder({
        title: novel.name,
        fileName: novel.name,
        author: novel.author ?? undefined,
        stylesheet: pdfStylesheet,
      }).prepare();

      const yieldToMain = () => new Promise(requestAnimationFrame);

      let addedChapters = 0;
      for (let i = 0; i < chapters.length; i++) {
        if (i % YIELD_EVERY === 0) {
          await yieldToMain();
        }

        if (isCancelledRef.current) {
          addLog(getString('novelScreen.exportPdfLogsModal.logCancelled'));
          await pdf.discardChanges();
          setIsExporting(false);
          return;
        }

        const chapter = chapters[i];

        addLog(
          getString('novelScreen.exportPdfLogsModal.logAddingChapter', {
            chapterNumber: (i + 1).toString(),
            chapterName: chapter.name,
          }),
        );

        const chapterContent = await readDownloadedChapterHtml(
          chapterIndexRel(novel.pluginId, novel.id, chapter.id),
        );

        if (chapterContent !== null) {
          const content = await dropMissingChapterImages(
            sanitizeChapterText(
              novel.pluginId,
              novel.name,
              chapter.name,
              chapterContent,
            ),
            novel.pluginId,
            novel.id,
            chapter.id,
          );

          pdf.addChapter({
            title:
              chapter.name?.trim() || `Chapter ${chapter.chapterNumber || i}`,
            htmlBody: content,
          });

          addedChapters++;
        }
      }

      if (addedChapters === 0) {
        addLog(getString('novelScreen.exportPdfLogsModal.logNoChapters'));
        await pdf.discardChanges();
        setIsExporting(false);
        return;
      }

      addLog(getString('novelScreen.exportPdfLogsModal.logRendering'));
      await yieldToMain();

      addLog(getString('novelScreen.exportPdfLogsModal.logSaving'));
      const result = await pdf.save();

      const successLog = getString('novelScreen.exportPdfLogsModal.logSuccess', {
        count: addedChapters,
        pages: result.numberOfPages,
      });
      addLog(successLog);
      addLog(
        getString('novelScreen.exportPdfLogsModal.logFileName', {
          path: result.fileName,
        }),
      );
      showToast(successLog);

      // Open the rendered document, mirroring the error-log viewer in App.tsx.
      try {
        await FileViewer.open(result.uri.replace('file://', ''));
      } catch {
        // No PDF viewer installed — the file is already saved, so this is
        // not worth a second error.
      }

      // Send push notification
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: getString('novelScreen.exportPdfLogsModal.notificationTitle'),
            body: getString('novelScreen.exportPdfLogsModal.notificationBody', {
              name: novel.name,
            }),
          },
          trigger: null,
        });
      } catch {
        // Notification permission denied or unavailable — non-critical
      }
    } catch (error: unknown) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        addLog(getString('novelScreen.exportPdfLogsModal.logSaveCancelled'));
        await pdf?.discardChanges();
        return;
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      const failedLog = getString('novelScreen.exportPdfLogsModal.logFailed', {
        error: errorMsg,
      });
      addLog(failedLog);
      showToast(failedLog);
      await pdf?.discardChanges();
    } finally {
      setIsExporting(false);
    }
  }, [novel, startChapter, endChapter, pdfStylesheet, addLog]);

  useEffect(() => {
    if (visible && logs.length === 0 && !isExporting) {
      startExport();
    }
  }, [visible, logs.length, isExporting, startExport]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleDismiss}
        dismissable={!isExporting}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.onSurface }]}>
            {getString('novelScreen.exportPdfLogsModal.title')}
          </Text>
          {isExporting && (
            <Text style={[styles.runningText, { color: theme.primary }]}>
              ● {getString('common.loading')}
            </Text>
          )}
        </View>

        <View>
          <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
            {getString('novelScreen.exportPdfLogsModal.description')}
          </Text>

          <LogViewer
            logs={logs}
            theme={theme}
            style={{ backgroundColor: theme.surfaceVariant, ...styles.list }}
            contentContainerStyle={styles.listContent}
          />
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.footerBtn,
              { borderColor: isExporting ? theme.outline : theme.primary },
              isExporting
                ? styles.bgTransparent
                : { backgroundColor: theme.primary },
            ]}
            onPress={handleDismiss}
          >
            <Text
              style={[
                styles.footerBtnText,
                { color: isExporting ? theme.onSurface : theme.onPrimary },
              ]}
            >
              {getString(isExporting ? 'common.cancel' : 'common.ok')}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  description: {
    marginBottom: 16,
  },
  runningText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  list: {
    borderRadius: 8,
    maxHeight: 350,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  footerBtn: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  footerBtnText: {
    fontSize: 13,
  },
  bgTransparent: {
    backgroundColor: 'transparent',
  },
});
