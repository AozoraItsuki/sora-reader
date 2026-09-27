import { LogViewer, Modal } from '@components';
import { BaseLogEntry } from '@components/LogViewer';
import { getNovelDownloadedChapters } from '@database/queries/ChapterQueries';
import { NovelInfo } from '@database/types';
import { useTheme } from '@hooks/persisted';
import EpubBuilder from '@modules/react-native-epub-creator';
import { resolveUrl } from '@services/plugin/fetch';
import { isSafReady, safExists, safReadFile } from '@services/saf/safFile';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import { APP_NAME } from '@utils/constants/metadata';
import {
  chapterIndexRel,
  chapterRel,
  isAbsoluteUri,
  legacyDownloadPath,
  resolveDownloadUrl,
} from '@utils/DownloadPaths';
import { showToast } from '@utils/showToast';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Portal } from 'react-native-paper';

import { version as appVersion } from '../../../../package.json';

/** Only image-looking assets are worth resolving and dropping. */
const IMAGE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/i;

const IMG_TAG_REGEX = /<img\b[^>]*>/gi;
const SRC_ATTR_REGEX = /\bsrc\s*=\s*["']([^"']*)["']/i;

/** Every `src` referenced by an `<img>` tag, in document order. */
const collectImageSources = (html: string): string[] => {
  const sources: string[] = [];
  for (const tag of html.matchAll(IMG_TAG_REGEX)) {
    const src = SRC_ATTR_REGEX.exec(tag[0])?.[1];
    if (src) {
      sources.push(src);
    }
  }
  return sources;
};

/**
 * Tree-relative location of an image referenced by a chapter, or `null` when
 * the reference is not a chapter-local asset (remote URL, data URI, or an
 * absolute path outside this chapter) and must therefore be left alone.
 */
const chapterImageRel = (
  src: string,
  pluginId: string,
  novelId: number,
  chapterId: number,
): string | null => {
  const bare = src.split(/[?#]/)[0];
  if (!bare) {
    return null;
  }

  const chapterDir = chapterRel(pluginId, novelId, chapterId);

  if (isAbsoluteUri(bare)) {
    // Legacy `file://.../<chapterDir>/<name>` form: keep only what lives inside
    // this chapter, everything else is handled elsewhere.
    const legacyDir = `${legacyDownloadPath(chapterDir)}/`;
    const at = bare.lastIndexOf(legacyDir);
    if (at < 0) {
      return null;
    }
    const name = bare.slice(at + legacyDir.length);
    return name && IMAGE_EXT_REGEX.test(name)
      ? `${chapterDir}/${name}`
      : null;
  }

  if (!IMAGE_EXT_REGEX.test(bare)) {
    return null;
  }
  return bare.startsWith('Novels/') ? bare : `${chapterDir}/${bare}`;
};

/** `true` when a tree-relative download asset is present in the SAF tree. */
const chapterAssetExists = async (relativePath: string): Promise<boolean> => {
  if (isSafReady()) {
    try {
      if (await safExists(relativePath)) {
        return true;
      }
    } catch {
      // Fall through to the legacy location.
    }
  }
  return NativeFile.exists(legacyDownloadPath(relativePath));
};

/** Read a downloaded chapter's `index.html`, or `null` when not downloaded. */
const readDownloadedChapterHtml = async (
  relativePath: string,
): Promise<string | null> => {
  if (isSafReady()) {
    try {
      return await safReadFile(relativePath);
    } catch {
      // Fall through to the legacy location.
    }
  }
  const legacyPath = legacyDownloadPath(relativePath);
  return NativeFile.exists(legacyPath) ? NativeFile.readFile(legacyPath) : null;
};

interface ExportEpubLogsModalProps {
  visible: boolean;
  onDismiss: () => void;
  novel: NovelInfo;
  destinationUri: string;
  startChapter?: number;
  endChapter?: number;
  epubStylesheet?: string;
  epubJavaScript?: string;
  epubUseCustomJS?: boolean;
}

export default function ExportEpubLogsModal({
  visible,
  onDismiss,
  novel,
  destinationUri,
  startChapter,
  endChapter,
  epubStylesheet,
  epubJavaScript,
  epubUseCustomJS,
}: ExportEpubLogsModalProps) {
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
    addLog(getString('novelScreen.exportEpubLogsModal.logStart'));

    let epub: EpubBuilder | undefined;

    try {
      addLog(getString('novelScreen.exportEpubLogsModal.logFetchChapters'));
      const chapters = await getNovelDownloadedChapters(
        novel.id,
        startChapter,
        endChapter,
      );

      if (chapters.length === 0) {
        addLog(getString('novelScreen.exportEpubLogsModal.logNoChapters'));
        setIsExporting(false);
        return;
      }

      addLog(getString('novelScreen.exportEpubLogsModal.logPreparing'));
      epub = new EpubBuilder(
        {
          title: novel.name,
          fileName: novel.name.replace(/[\\/:*?"<>|\s]/g, '') || 'novel',
          language: 'en',
          // The EPUB builder fetches non-internal sources over HTTP, so a
          // tree-relative cover is served by the local server here.
          cover: resolveDownloadUrl(novel.cover),
          description: novel.summary ?? undefined,
          author: novel.author ?? undefined,
          bookId: novel.pluginId.toString(),
          stylesheet: epubStylesheet || undefined,
          js: epubUseCustomJS ? epubJavaScript : undefined,
          genres: novel.genres
            ? novel.genres
                .split(',')
                .map(g => g.trim())
                .filter(Boolean)
            : undefined,
          publisher: novel.pluginId,
          generator: `${APP_NAME} v${appVersion}`,
          novelUrl: novel.pluginId
            ? resolveUrl(novel.pluginId, novel.path, true)
            : '',
          novelStatus: novel.status ?? undefined,
        },
        destinationUri,
      );

      await epub.prepare();

      const yieldToMain = () => new Promise(requestAnimationFrame);

      let addedChapters = 0;
      for (let i = 0; i < chapters.length; i++) {
        if (i % 10 === 0) {
          await yieldToMain();
        }

        if (isCancelledRef.current) {
          addLog(getString('novelScreen.exportEpubLogsModal.logCancelled'));
          await epub.discardChanges();
          setIsExporting(false);
          return;
        }

        const chapter = chapters[i];

        addLog(
          getString('novelScreen.exportEpubLogsModal.logAddingChapter', {
            chapterNumber: (i + 1).toString(),
            chapterName: chapter.name,
          }),
        );

        const chapterContent = await readDownloadedChapterHtml(
          chapterIndexRel(novel.pluginId, novel.id, chapter.id),
        );

        if (chapterContent !== null) {
          let content = chapterContent;

          // Images are rewritten to bare names when a chapter is downloaded, so
          // they have to be resolved against the chapter directory before we can
          // tell whether the export can actually embed them.
          for (const src of collectImageSources(content)) {
            const assetRel = chapterImageRel(
              src,
              novel.pluginId,
              novel.id,
              chapter.id,
            );
            if (!assetRel || (await chapterAssetExists(assetRel))) {
              continue;
            }

            const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            content = content.replace(
              new RegExp(
                `<figure[^>]*>[\\s\\S]*?${escapedSrc}[\\s\\S]*?</figure>`,
                'g',
              ),
              '',
            );
            content = content.replace(
              new RegExp(`<img\\b[^>]*${escapedSrc}[^>]*\\/?>`, 'g'),
              '',
            );
          }

          epub.addChapter({
            title:
              chapter.name?.trim() || `Chapter ${chapter.chapterNumber || i}`,
            fileName: `Chapter${i}`,
            htmlBody: `<section epub:type="chapter" data-epub-chapter data-novel-id="${novel.pluginId}" data-chapter-id="${chapter.id}">${content}</section>`,
          });

          addedChapters++;
        }
      }

      if (addedChapters === 0) {
        addLog(getString('novelScreen.exportEpubLogsModal.logNoChapters'));
        await epub.discardChanges();
        setIsExporting(false);
        return;
      }

      addLog(getString('novelScreen.exportEpubLogsModal.logZipping'));
      await yieldToMain();

      const outputFile = await epub.save();

      const successLog = getString(
        'novelScreen.exportEpubLogsModal.logSuccess',
        {
          count: addedChapters,
        },
      );
      addLog(successLog);
      addLog(
        getString('novelScreen.exportEpubLogsModal.logFilePath', {
          path: outputFile,
        }),
      );
      showToast(successLog);

      // Send push notification
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: getString(
              'novelScreen.exportEpubLogsModal.notificationTitle',
            ),
            body: getString(
              'novelScreen.exportEpubLogsModal.notificationBody',
              { name: novel.name },
            ),
          },
          trigger: null,
        });
      } catch {
        // Notification permission denied or unavailable — non-critical
      }
    } catch (error: any) {
      const errorMsg = error?.message || error;
      const failedLog = getString('novelScreen.exportEpubLogsModal.logFailed', {
        error: errorMsg,
      });
      addLog(failedLog);
      showToast(failedLog);
      await epub?.discardChanges();
    } finally {
      setIsExporting(false);
    }
  }, [
    novel,
    destinationUri,
    startChapter,
    endChapter,
    epubStylesheet,
    epubJavaScript,
    epubUseCustomJS,
    addLog,
  ]);

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
            {getString('novelScreen.exportEpubLogsModal.title')}
          </Text>
          {isExporting && (
            <Text style={[styles.runningText, { color: theme.primary }]}>
              ● {getString('common.loading')}
            </Text>
          )}
        </View>

        <View>
          <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
            {getString('novelScreen.exportEpubLogsModal.description')}
          </Text>

          <LogViewer
            logs={logs}
            theme={theme}
            style={{ backgroundColor: theme.surfaceVariant, ...styles.list }}
            contentContainerStyle={styles.listContent}
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.footerRight}>
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
  footerRight: {
    flexDirection: 'row',
  },
});
