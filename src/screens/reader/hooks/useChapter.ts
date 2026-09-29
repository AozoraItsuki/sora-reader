import {
  getChapter as getDbChapter,
  getChapterCount,
  getNextChapter,
  getPrevChapter,
  insertChapters,
} from '@database/queries/ChapterQueries';
import { insertHistory } from '@database/queries/HistoryQueries';
import { ChapterInfo, NovelInfo } from '@database/types';
import { useFullscreenMode } from '@hooks';
import {
  useChapterGeneralSettings,
  useLibrarySettings,
  useTrackedNovel,
  useTracker,
} from '@hooks/persisted';
import {
  ACTIVE_AI_PROVIDER_KEY,
  AI_PROVIDERS_KEY,
  AIProvider,
} from '@hooks/persisted/useAIProviders';
import {
  initialTranslateSettings,
  TRANSLATE_SETTINGS,
  TranslateSettings,
} from '@hooks/persisted/useSettings';
import { LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import { useNovelActions } from '@screens/novel/NovelContext';
import { fetchChapter, fetchPage } from '@services/plugin/fetch';
import {
  isSafReady,
  probeDirectStorage,
  safReadFile,
} from '@services/saf/safFile';
import {
  TranslateConfig,
  TranslateManager,
} from '@services/translate/TranslateManager';
import NativeFile from '@specs/NativeFile';
import NativeSPenRemote from '@specs/NativeSPenRemote';
import NativeVolumeButtonListener from '@specs/NativeVolumeButtonListener';
import { getString } from '@strings/translations';
import { chapterIndexRel, legacyDownloadPath } from '@utils/DownloadPaths';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { parseChapterNumber } from '@utils/parseChapterNumber';
import { showToast } from '@utils/showToast';
import { NOVEL_STORAGE } from '@utils/Storages';
import { load } from 'cheerio';
import * as Speech from 'expo-speech';
import { defaultTo } from 'lodash-es';
import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  useWindowDimensions,
} from 'react-native';
import WebView from 'react-native-webview';

import { sanitizeChapterText } from '../utils/sanitizeChapterText';
import {
  handleSPenRemoteEvent,
  SPEN_REMOTE_EVENTS,
  SPenRemoteEventName,
} from '../utils/sPenRemote';

const { TikTokTTS } = NativeModules;

const emmiter = new NativeEventEmitter(NativeVolumeButtonListener);
const sPenEmitter = NativeSPenRemote
  ? new NativeEventEmitter(NativeSPenRemote)
  : null;

/**
 * Read a downloaded chapter from its tree-relative path.
 *
 * The download tree is the source of truth as soon as it is readable; the legacy
 * app-private path stays as a fallback so installs that have not migrated yet
 * keep resolving their downloads. Readiness is re-probed rather than read from
 * the cache, because a read on the first frames after boot would otherwise skip
 * the tree, miss the legacy path too, and fall through to a source fetch that
 * fails with no network. Returns `null` when the chapter is not downloaded at
 * all, so the caller can fall back to the source.
 */
const readDownloadedChapter = async (
  relativePath: string,
): Promise<string | null> => {
  if (isSafReady() || probeDirectStorage()) {
    try {
      return await safReadFile(relativePath);
    } catch {
      // Permission can be revoked while the app is running; the legacy path
      // below is the last resort.
    }
  }

  const legacyPath = legacyDownloadPath(relativePath);
  return NativeFile.exists(legacyPath) ? NativeFile.readFile(legacyPath) : null;
};

export default function useChapter(
  webViewRef: RefObject<WebView | null>,
  initialChapter: ChapterInfo,
  novel: NovelInfo,
) {
  const {
    setLastRead,
    markChapterRead,
    updateChapterProgress,
    chapterTextCache,
  } = useNovelActions();
  const [hidden, setHidden] = useState(true);
  const [chapter, setChapter] = useState(initialChapter);
  const [loading, setLoading] = useState(true);
  const [chapterText, setChapterText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(0);
  const [isTranslated, setIsTranslated] = useState(false);
  const [isOfflineTranslated, setIsOfflineTranslated] = useState(false);
  const originalChapterText = useRef<string>('');
  const chapterIdRef = useRef<number>(initialChapter.id);
  const activeChapterIdRef = useRef<number>(initialChapter.id);
  const chapterSessionRef = useRef(0);
  const progressCommitRef = useRef(0);
  // Last persisted progress per save target. Scroll-driven `save` events fire
  // repeatedly with identical values; skipping them avoids redundant DB writes
  // and redundant store remaps/re-renders.
  const lastSavedProgressRef = useRef<{
    chapId: number;
    pct: number;
    charOffset: number | undefined;
  } | null>(null);

  // --- Background pre-translate state (persists across chapter navigation) ---
  // Cache: stores the translated HTML for exactly 1 pre-translated chapter
  const translatedChapterCache = useRef<Map<number, string>>(new Map());
  // Tracks the AbortController for the current foreground translation
  const currentTranslateAbort = useRef<AbortController | null>(null);
  // Tracks the AbortController for the background pre-translation
  const backgroundTranslateAbort = useRef<AbortController | null>(null);
  // Tracks which chapter ID is being background-translated
  const backgroundTranslatingChapterId = useRef<number | null>(null);
  // A callback ref to update state when background translation finishes for the current chapter
  const onBackgroundCompleteRef = useRef<
    ((chapterId: number, html: string) => void) | null
  >(null);

  const [[nextChapter, prevChapter], setAdjacentChapter] = useState<
    ChapterInfo[] | undefined[]
  >([]);
  const {
    autoScroll,
    autoScrollInterval,
    autoScrollOffset,
    useVolumeButtons,
    volumeButtonsOffset,
    pageReader: isPageReaderMode,
  } = useChapterGeneralSettings();
  const { incognitoMode } = useLibrarySettings();
  const [error, setError] = useState<string>();
  const { height: windowHeight } = useWindowDimensions();
  const { tracker } = useTracker();
  const { trackedNovel, updateAllTrackedNovels } = useTrackedNovel(novel.id);
  const { setImmersiveMode, showStatusAndNavBar } = useFullscreenMode();

  const connectVolumeButton = useCallback(() => {
    emmiter.addListener('VolumeUp', () => {
      if (isPageReaderMode) {
        webViewRef.current?.injectJavaScript(`(()=>{
          pageReader.movePage(pageReader.page.val - 1);
        })()`);
      } else {
        const offset = defaultTo(
          volumeButtonsOffset,
          Math.round(windowHeight * 0.75),
        );
        webViewRef.current?.injectJavaScript(`(()=>{
          window.scrollBy({top: -${offset}, behavior: 'smooth'})
        })()`);
      }
    });
    emmiter.addListener('VolumeDown', () => {
      if (isPageReaderMode) {
        webViewRef.current?.injectJavaScript(`(()=>{
          pageReader.movePage(pageReader.page.val + 1);
        })()`);
      } else {
        const offset = defaultTo(
          volumeButtonsOffset,
          Math.round(windowHeight * 0.75),
        );
        webViewRef.current?.injectJavaScript(`(()=>{
          window.scrollBy({top: ${offset}, behavior: 'smooth'})
        })()`);
      }
    });
  }, [webViewRef, volumeButtonsOffset, isPageReaderMode, windowHeight]);

  useEffect(() => {
    if (useVolumeButtons) {
      connectVolumeButton();
    } else {
      emmiter.removeAllListeners('VolumeUp');
      emmiter.removeAllListeners('VolumeDown');
      // this is just for sure, without it app still works properly
    }

    return () => {
      emmiter.removeAllListeners('VolumeUp');
      emmiter.removeAllListeners('VolumeDown');
      Speech.stop();
      TikTokTTS?.stop();
    };
  }, [useVolumeButtons, chapter, connectVolumeButton]);

  // Cleanup: abort all translations when the hook unmounts (leaving reader)
  useEffect(() => {
    const cache = translatedChapterCache.current;
    return () => {
      chapterSessionRef.current += 1;
      progressCommitRef.current += 1;
      currentTranslateAbort.current?.abort();
      backgroundTranslateAbort.current?.abort();
      cache.clear();
    };
  }, []);

  const fetchChapterHtmlForInfiniteScroll = useCallback(
    async (chap: ChapterInfo): Promise<string> => {
      const rawText = await Promise.resolve(
        chapterTextCache.read(chap.id) ?? loadChapterText(chap.id, chap.path),
      );
      return sanitizeChapterText(
        novel.pluginId,
        novel.name,
        chap.name,
        rawText,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapterTextCache, novel.pluginId, novel.name],
  );

  const loadChapterText = useCallback(
    async (id: number, path: string) => {
      let text = '';
      if (novel.pluginId === LOCAL_PLUGIN_ID) {
        // Local novels live in the shared download tree now
        // (`Novels/local/{novelId}/{chapterId}/index.html`); the legacy
        // app-private path is only a fallback for installs that have not
        // migrated yet. LocalPlugin.parseChapter() returns '' when the
        // legacy folder is gone, which the reader renders as "Chapter is
        // empty" — so the tree has to be tried first.
        const relativePath = chapterIndexRel(
          LOCAL_PLUGIN_ID,
          chapter.novelId,
          id,
        );
        const downloaded = await readDownloadedChapter(relativePath);
        if (downloaded !== null) {
          text = downloaded;
        } else {
          const chapterDir = `${NOVEL_STORAGE}/local/${chapter.novelId}/${id}`;
          text = await fetchChapter(novel.pluginId, chapterDir);
        }
      } else {
        // Online novels: check the downloaded chapter first, then fetch from
        // the source. Downloads now live in the SAF tree, so the relative path
        // is read through SAF and only falls back to the legacy app-private
        // location when no download folder has been picked yet.
        const relativePath = chapterIndexRel(
          novel.pluginId,
          chapter.novelId,
          id,
        );
        const downloaded = await readDownloadedChapter(relativePath);
        if (downloaded !== null) {
          text = downloaded;
        } else {
          text = await fetchChapter(novel.pluginId, path);
        }
      }
      return text;
    },
    [chapter.novelId, novel.pluginId],
  );

  // --- Background pre-translate helper ---
  const startBackgroundTranslate = useCallback(
    (targetChapter: ChapterInfo, rawText: string) => {
      // Cancel any existing background translation
      backgroundTranslateAbort.current?.abort();

      const settings =
        getMMKVObject<TranslateSettings>(TRANSLATE_SETTINGS) ||
        initialTranslateSettings;

      if (!settings.autoTranslateNextChapter) return;

      const abortCtrl = new AbortController();
      backgroundTranslateAbort.current = abortCtrl;
      backgroundTranslatingChapterId.current = targetChapter.id;

      const sanitizedText = sanitizeChapterText(
        novel.pluginId,
        novel.name,
        targetChapter.name,
        rawText,
      );

      const providers = getMMKVObject<AIProvider[]>(AI_PROVIDERS_KEY) || [];
      const activeProviderId = getMMKVObject<string>(ACTIVE_AI_PROVIDER_KEY);
      const activeAIProvider = providers.find(p => p.id === activeProviderId);

      const config: TranslateConfig = {
        ...(settings as any),
        activeAIProvider,
      };

      TranslateManager.translateChapterHTML(
        sanitizedText,
        config,
        undefined, // no progress callback for background
        abortCtrl.signal,
      )
        .then(translatedHtml => {
          if (abortCtrl.signal.aborted) return;

          // Store in cache (limit to 1 entry)
          translatedChapterCache.current.clear();
          translatedChapterCache.current.set(targetChapter.id, translatedHtml);
          backgroundTranslatingChapterId.current = null;

          // If the user is currently viewing this chapter, apply translation
          if (onBackgroundCompleteRef.current) {
            onBackgroundCompleteRef.current(targetChapter.id, translatedHtml);
          }
        })
        .catch(e => {
          if (e?.name === 'AbortError') return; // silently ignore cancellation
          backgroundTranslatingChapterId.current = null;
          // On error, do NOT continue translating
        });
    },
    [novel.pluginId, novel.name],
  );

  const getChapter = useCallback(
    async (navChapter?: ChapterInfo) => {
      const requestedChapterId = navChapter?.id ?? chapter.id;
      if (navChapter) {
        chapterSessionRef.current += 1;
        activeChapterIdRef.current = requestedChapterId;
      } else if (requestedChapterId !== activeChapterIdRef.current) {
        return;
      }

      const readSession = chapterSessionRef.current;
      const isCurrentRead = () =>
        readSession === chapterSessionRef.current &&
        requestedChapterId === activeChapterIdRef.current;

      try {
        const dbChapter = navChapter
          ? undefined
          : await getDbChapter(chapter.id);
        if (!isCurrentRead()) return;

        const chap = dbChapter ?? navChapter ?? chapter;
        const cachedText = await chapterTextCache.read(chap.id);
        if (!isCurrentRead()) return;

        const text =
          cachedText && cachedText.length > 0
            ? cachedText
            : loadChapterText(chap.id, chap.path);
        const [nextChapResult, prevChapResult, awaitedText] = await Promise.all(
          [
            getNextChapter(
              chap.novelId,
              chap.position!,
              chap.page ?? '',
              chap.id,
            ),
            getPrevChapter(
              chap.novelId,
              chap.position!,
              chap.page ?? '',
              chap.id,
            ),
            text,
          ],
        );
        if (!isCurrentRead()) return;

        let nextChap = nextChapResult;
        let prevChap = prevChapResult;
        const totalPages = novel.totalPages ?? 0;

        // Pre-fetch adjacent page chapters if at a page boundary
        const currentPage = Number(chap.page);
        if (!nextChap && totalPages > 0 && currentPage < totalPages) {
          const nextPage = String(currentPage + 1);
          try {
            const count = await getChapterCount(chap.novelId, nextPage);
            if (count === 0) {
              const sourcePage = await fetchPage(
                novel.pluginId,
                novel.path,
                nextPage,
              );
              await insertChapters(
                chap.novelId,
                sourcePage.chapters.map(ch => ({ ...ch, page: nextPage })),
              );
            }
            nextChap = await getNextChapter(
              chap.novelId,
              chap.position!,
              chap.page ?? '',
              chap.id,
            );
          } catch {}
        }
        if (!prevChap && currentPage > 1) {
          const prevPage = String(currentPage - 1);
          try {
            const count = await getChapterCount(chap.novelId, prevPage);
            if (count === 0) {
              const sourcePage = await fetchPage(
                novel.pluginId,
                novel.path,
                prevPage,
              );
              await insertChapters(
                chap.novelId,
                sourcePage.chapters.map(ch => ({ ...ch, page: prevPage })),
              );
            }
            prevChap = await getPrevChapter(
              chap.novelId,
              chap.position!,
              chap.page ?? '',
              chap.id,
            );
          } catch {}
        }
        if (!isCurrentRead()) return;

        // Cancel foreground translation from previous chapter
        currentTranslateAbort.current?.abort();
        currentTranslateAbort.current = null;

        chapterIdRef.current = chap.id;

        // using cheerio
        const loadedCheerio = load(awaitedText);
        const isOffline =
          loadedCheerio('meta[id="offline-translated-marker"]').length > 0;
        const noCache = loadedCheerio('meta[id="no-cache-marker"]').length > 0;
        const noPrefetch =
          loadedCheerio('meta[id="no-prefetch-marker"]').length > 0;

        if (!noPrefetch && nextChap && !chapterTextCache.read(nextChap.id)) {
          const prefetchPromise = loadChapterText(nextChap.id, nextChap.path);
          prefetchPromise.catch(() => {
            chapterTextCache.remove(nextChap!.id);
          });
          chapterTextCache.write(nextChap.id, prefetchPromise);
        }

        if (noCache) {
          chapterTextCache.remove(chap.id);
        } else if (!cachedText) {
          chapterTextCache.write(chap.id, text);
        }

        if (isOffline) {
          showToast(getString('readerScreen.usingOfflineTranslation'));
          setIsOfflineTranslated(true);
          setIsTranslated(true);
          setIsTranslating(false);
          setTranslateProgress(100);
          originalChapterText.current = '';
          onBackgroundCompleteRef.current = null;

          setChapter(chap);
          setChapterText(
            sanitizeChapterText(
              novel.pluginId,
              novel.name,
              chap.name,
              awaitedText,
            ),
          );
          setAdjacentChapter([nextChap!, prevChap!]);

          translatedChapterCache.current.delete(chap.id);
        } else {
          setIsOfflineTranslated(false);
          // Check if we have a cached translation for this chapter
          const cachedTranslation = translatedChapterCache.current.get(chap.id);
          if (cachedTranslation) {
            // We have a pre-translated version ready
            originalChapterText.current = sanitizeChapterText(
              novel.pluginId,
              novel.name,
              chap.name,
              awaitedText,
            );
            setIsTranslated(true);
            setIsTranslating(false);
            setTranslateProgress(100);
            setChapter(chap);
            setChapterText(cachedTranslation);
            setAdjacentChapter([nextChap!, prevChap!]);
            // Clear the cache entry since we consumed it
            translatedChapterCache.current.delete(chap.id);

            // If there's a next chapter and autoTranslate is on, pre-translate it
            if (!noPrefetch && nextChap) {
              const nextRawText =
                chapterTextCache.read(nextChap.id) ??
                loadChapterText(nextChap.id, nextChap.path);
              Promise.resolve(nextRawText)
                .then(resolvedText => {
                  if (chapterIdRef.current === chap.id) {
                    startBackgroundTranslate(nextChap!, resolvedText);
                  }
                })
                .catch(() => {});
            }
          } else if (backgroundTranslatingChapterId.current === chap.id) {
            // The background is currently translating this chapter
            originalChapterText.current = sanitizeChapterText(
              novel.pluginId,
              novel.name,
              chap.name,
              awaitedText,
            );
            setIsTranslating(true);
            setTranslateProgress(0);
            setIsTranslated(false);
            setChapter(chap);
            setChapterText(
              sanitizeChapterText(
                novel.pluginId,
                novel.name,
                chap.name,
                awaitedText,
              ),
            );
            setAdjacentChapter([nextChap!, prevChap!]);

            // Register callback so when background finishes, we apply it
            onBackgroundCompleteRef.current = (
              completedChapterId: number,
              html: string,
            ) => {
              if (chapterIdRef.current === completedChapterId) {
                setChapterText(html);
                setIsTranslated(true);
                setIsTranslating(false);
                setTranslateProgress(100);

                // Pre-translate the next chapter after background completes
                if (!noPrefetch && nextChap) {
                  const nextRawText =
                    chapterTextCache.read(nextChap.id) ??
                    loadChapterText(nextChap.id, nextChap.path);
                  Promise.resolve(nextRawText)
                    .then(resolvedText => {
                      if (chapterIdRef.current === completedChapterId) {
                        startBackgroundTranslate(nextChap!, resolvedText);
                      }
                    })
                    .catch(() => {});
                }
              }
              onBackgroundCompleteRef.current = null;
            };
          } else {
            // Normal case: no cached translation, not being background-translated
            setIsTranslated(false);
            setIsTranslating(false);
            setTranslateProgress(0);
            originalChapterText.current = '';
            onBackgroundCompleteRef.current = null;

            setChapter(chap);
            setChapterText(
              sanitizeChapterText(
                novel.pluginId,
                novel.name,
                chap.name,
                awaitedText,
              ),
            );
            setAdjacentChapter([nextChap!, prevChap!]);
          }
        }
      } catch (error: unknown) {
        if (isCurrentRead()) {
          setError(error instanceof Error ? error.message : String(error));
          setLoading(false);
          activeChapterIdRef.current = chapter.id;
        }
      } finally {
        if (isCurrentRead()) setLoading(false);
      }
    },
    [
      chapter,
      chapterTextCache,
      loadChapterText,
      setChapter,
      setChapterText,
      novel.pluginId,
      novel.name,
      novel.path,
      novel.totalPages,
      setLoading,
      startBackgroundTranslate,
    ],
  );

  const lastInteractionTime = useRef(Date.now());
  const autoScrollTimeout = useRef<NodeJS.Timeout>(null);

  const resetAutoScroll = useCallback(() => {
    lastInteractionTime.current = Date.now();
  }, []);

  useEffect(() => {
    let active = true;
    lastInteractionTime.current = Date.now();

    if (autoScroll && hidden) {
      const loop = () => {
        if (!active) return;
        const now = Date.now();
        const elapsed = now - lastInteractionTime.current;
        const delay = autoScrollInterval * 1000 - elapsed;

        if (delay <= 0) {
          if (AppState.currentState === 'active') {
            if (isPageReaderMode) {
              webViewRef.current?.injectJavaScript(`(()=>{
                pageReader.movePage(pageReader.page.val + 1);
              })()`);
            } else {
              webViewRef.current?.injectJavaScript(`(()=>{
                window.scrollBy({top:${defaultTo(
                  autoScrollOffset,
                  windowHeight,
                )},behavior:'smooth'})
              })()`);
            }
          }
          lastInteractionTime.current = Date.now();
          autoScrollTimeout.current = setTimeout(
            loop,
            autoScrollInterval * 1000,
          );
        } else {
          autoScrollTimeout.current = setTimeout(loop, delay);
        }
      };

      autoScrollTimeout.current = setTimeout(loop, autoScrollInterval * 1000);
    } else if (autoScrollTimeout.current) {
      clearTimeout(autoScrollTimeout.current);
    }

    return () => {
      active = false;
      if (autoScrollTimeout.current) clearTimeout(autoScrollTimeout.current);
    };
  }, [
    autoScroll,
    autoScrollInterval,
    autoScrollOffset,
    webViewRef,
    hidden,
    isPageReaderMode,
    windowHeight,
  ]);

  const updateTracker = useCallback(() => {
    const chapterNumber = parseChapterNumber(novel.name, chapter.name);
    if (tracker && trackedNovel && chapterNumber > trackedNovel.progress) {
      updateAllTrackedNovels({ progress: chapterNumber });
    }
  }, [chapter.name, novel.name, trackedNovel, tracker, updateAllTrackedNovels]);

  const saveProgress = useCallback(
    async (
      percentage: number,
      targetChapterId?: number,
      charOffset?: number,
    ): Promise<void> => {
      if (incognitoMode) return;

      const chapId = targetChapterId ?? chapter.id;
      const clampedPct = Number.isFinite(percentage)
        ? Math.min(100, Math.max(0, percentage))
        : 0;
      // Normalize the same way the persistence layer does, so the dedupe key
      // reflects the value that would actually be stored.
      const normalizedCharOffset =
        charOffset !== undefined &&
        Number.isFinite(charOffset) &&
        charOffset >= 0
          ? Math.floor(charOffset)
          : undefined;
      const lastSaved = lastSavedProgressRef.current;
      if (
        lastSaved &&
        lastSaved.chapId === chapId &&
        lastSaved.pct === clampedPct &&
        lastSaved.charOffset === normalizedCharOffset
      ) {
        return;
      }
      lastSavedProgressRef.current = {
        chapId,
        pct: clampedPct,
        charOffset: normalizedCharOffset,
      };
      const commit = ++progressCommitRef.current;
      const readSession = chapterSessionRef.current;
      const isCurrentCommit = () =>
        commit === progressCommitRef.current &&
        readSession === chapterSessionRef.current;
      const isTargetChapter =
        targetChapterId !== undefined && targetChapterId !== chapter.id;
      const persistence =
        charOffset === undefined
          ? updateChapterProgress(chapId, clampedPct)
          : updateChapterProgress(chapId, clampedPct, charOffset);

      if (clampedPct >= 97) {
        // a relative number
        markChapterRead(chapId);
        if (!isTargetChapter) {
          updateTracker();
        }
      }

      await Promise.resolve(persistence);

      if (isTargetChapter) {
        await Promise.resolve(insertHistory(chapId));

        if (!isCurrentCommit()) return;

        const result = await getDbChapter(chapId);
        if (isCurrentCommit() && result) {
          setLastRead(result);
        }
      }
    },
    [
      chapter.id,
      incognitoMode,
      markChapterRead,
      setLastRead,
      updateChapterProgress,
      updateTracker,
    ],
  );

  const hideHeader = useCallback(() => {
    if (!hidden) {
      webViewRef.current?.injectJavaScript('reader.hidden.val = true');
      setImmersiveMode();
    } else {
      webViewRef.current?.injectJavaScript('reader.hidden.val = false');
      showStatusAndNavBar();
    }
    setHidden(!hidden);
    resetAutoScroll();
  }, [
    hidden,
    setImmersiveMode,
    showStatusAndNavBar,
    webViewRef,
    resetAutoScroll,
  ]);

  const navigateChapter = useCallback(
    (position: 'NEXT' | 'PREV') => {
      let nextNavChapter;
      if (position === 'NEXT') {
        nextNavChapter = nextChapter;
      } else if (position === 'PREV') {
        nextNavChapter = prevChapter;
      } else {
        return;
      }
      if (nextNavChapter) {
        // Cancel any ongoing foreground translation for the current chapter
        if (currentTranslateAbort.current) {
          currentTranslateAbort.current.abort();
          currentTranslateAbort.current = null;
        }
        // Reset translation state so the new chapter starts clean
        setIsTranslating(false);
        setIsTranslated(false);
        setTranslateProgress(0);
        originalChapterText.current = '';

        resetAutoScroll();
        setLoading(true);
        getChapter(nextNavChapter);
      } else {
        showToast(
          position === 'NEXT'
            ? getString('readerScreen.noNextChapter')
            : getString('readerScreen.noPreviousChapter'),
        );
      }
    },
    [getChapter, nextChapter, prevChapter, resetAutoScroll],
  );

  const navigateChapterRef = useRef(navigateChapter);
  useEffect(() => {
    navigateChapterRef.current = navigateChapter;
  }, [navigateChapter]);

  const connectSPenRemote = useCallback(() => {
    if (!sPenEmitter) {
      return () => {};
    }

    const subscriptions = (
      Object.values(SPEN_REMOTE_EVENTS) as SPenRemoteEventName[]
    ).map(eventName =>
      sPenEmitter.addListener(eventName, () =>
        handleSPenRemoteEvent(
          {
            navigateChapter: pos => navigateChapterRef.current(pos),
            webViewRef,
          },
          eventName,
        ),
      ),
    );

    return () => {
      subscriptions.forEach(subscription => subscription.remove());
    };
  }, [webViewRef]);

  useEffect(() => {
    const disconnect = connectSPenRemote();

    return () => {
      disconnect();
    };
  }, [connectSPenRemote]);

  useEffect(() => {
    if (incognitoMode) return;

    const chapterId = chapter.id;
    const readSession = chapterSessionRef.current;
    const commit = progressCommitRef.current;
    insertHistory(chapterId);
    void Promise.resolve(getDbChapter(chapterId)).then(result => {
      if (
        result &&
        readSession === chapterSessionRef.current &&
        commit === progressCommitRef.current
      ) {
        setLastRead(result);
      }
    });

    return () => {
      chapterSessionRef.current += 1;
    };
  }, [incognitoMode, setLastRead, setLoading, chapter.id]);

  useEffect(() => {
    if (!chapter || !chapterText) {
      getChapter();
    }
  }, [chapter, chapterText, getChapter]);

  const refetch = useCallback(() => {
    setLoading(true);
    setError('');
    chapterTextCache.remove(chapter.id);
    getChapter();
  }, [getChapter, chapter.id, chapterTextCache]);

  const revertTranslation = useCallback(() => {
    if (isTranslated && originalChapterText.current) {
      setChapterText(originalChapterText.current);
      setIsTranslated(false);
    }
  }, [isTranslated]);

  const translateChapter = useCallback(async () => {
    // If currently translating (foreground or background for this chapter), cancel it
    if (isTranslating) {
      currentTranslateAbort.current?.abort();
      currentTranslateAbort.current = null;
      // Also cancel background if it's translating this chapter
      if (backgroundTranslatingChapterId.current === chapterIdRef.current) {
        backgroundTranslateAbort.current?.abort();
        backgroundTranslateAbort.current = null;
        backgroundTranslatingChapterId.current = null;
      }
      onBackgroundCompleteRef.current = null;
      setIsTranslating(false);
      setTranslateProgress(0);
      // Revert to original text if we had saved it
      if (originalChapterText.current) {
        setChapterText(originalChapterText.current);
      }
      return;
    }

    // Toggle: if already translated, revert to original
    if (isTranslated) {
      revertTranslation();
      return;
    }

    // Start foreground translation
    const abortCtrl = new AbortController();
    currentTranslateAbort.current = abortCtrl;

    setIsTranslating(true);
    setTranslateProgress(0);
    const translatingChapterId = chapterIdRef.current;

    try {
      // Save original before translating
      originalChapterText.current = chapterText;

      const settings =
        getMMKVObject<TranslateSettings>(TRANSLATE_SETTINGS) ||
        initialTranslateSettings;

      const providers = getMMKVObject<AIProvider[]>(AI_PROVIDERS_KEY) || [];
      const activeProviderId = getMMKVObject<string>(ACTIVE_AI_PROVIDER_KEY);
      const activeAIProvider = providers.find(p => p.id === activeProviderId);

      const config: TranslateConfig = {
        ...(settings as any),
        activeAIProvider,
      };

      const translatedHtml = await TranslateManager.translateChapterHTML(
        chapterText,
        config,
        progress => setTranslateProgress(progress),
        abortCtrl.signal,
      );

      if (
        chapterIdRef.current === translatingChapterId &&
        !abortCtrl.signal.aborted
      ) {
        setChapterText(translatedHtml);
        setIsTranslated(true);

        // If autoTranslateNextChapter is on, pre-translate the next chapter
        if (settings.autoTranslateNextChapter && nextChapter) {
          const loadedCheerio = load(originalChapterText.current);
          const noPrefetch =
            loadedCheerio('meta[id="no-prefetch-marker"]').length > 0;
          if (!noPrefetch) {
            const nextRawText =
              chapterTextCache.read(nextChapter.id) ??
              loadChapterText(nextChapter.id, nextChapter.path);
            Promise.resolve(nextRawText)
              .then(resolvedText => {
                if (chapterIdRef.current === translatingChapterId) {
                  startBackgroundTranslate(nextChapter, resolvedText);
                }
              })
              .catch(() => {});
          }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // Translation was cancelled, do nothing
        return;
      }
      if (chapterIdRef.current === translatingChapterId) {
        showToast(e.message);
      }
    } finally {
      if (
        chapterIdRef.current === translatingChapterId &&
        !abortCtrl.signal.aborted
      ) {
        setIsTranslating(false);
        currentTranslateAbort.current = null;
      }
    }
  }, [
    chapterText,
    isTranslated,
    isTranslating,
    revertTranslation,
    nextChapter,
    chapterTextCache,
    loadChapterText,
    startBackgroundTranslate,
  ]);

  return useMemo(
    () => ({
      hidden,
      chapter,
      nextChapter,
      prevChapter,
      error,
      loading,
      chapterText,
      setHidden,
      saveProgress,
      hideHeader,
      navigateChapter,
      fetchChapterHtmlForInfiniteScroll,
      refetch,
      setChapter,
      setLoading,
      getChapter,
      isTranslating,
      translateProgress,
      translateChapter,
      isTranslated,
      isOfflineTranslated,
      revertTranslation,
      resetAutoScroll,
    }),
    [
      hidden,
      chapter,
      nextChapter,
      prevChapter,
      error,
      loading,
      chapterText,
      setHidden,
      saveProgress,
      hideHeader,
      navigateChapter,
      fetchChapterHtmlForInfiniteScroll,
      refetch,
      setChapter,
      setLoading,
      getChapter,
      isTranslating,
      translateProgress,
      translateChapter,
      isTranslated,
      isOfflineTranslated,
      revertTranslation,
      resetAutoScroll,
    ],
  );
}
