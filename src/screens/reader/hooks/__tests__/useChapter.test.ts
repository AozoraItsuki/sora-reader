import NativeFile from '@specs/NativeFile';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import useChapter from '../useChapter';

const mockUseNovelActions = jest.fn();
const mockUseChapterGeneralSettings = jest.fn();
const mockUseLibrarySettings = jest.fn();
const mockUseTracker = jest.fn();
const mockUseTrackedNovel = jest.fn();
const mockUseFullscreenMode = jest.fn();

const mockGetDbChapter = jest.fn();
const mockGetChapterCount = jest.fn();
const mockGetNextChapter = jest.fn();
const mockGetPrevChapter = jest.fn();
const mockInsertChapters = jest.fn();
const mockInsertHistory = jest.fn();
const mockFetchChapter = jest.fn();
const mockFetchPage = jest.fn();
const mockSanitizeChapterText = jest.fn();
const mockParseChapterNumber = jest.fn();

jest.mock('@screens/novel/NovelContext', () => ({
  useNovelActions: () => mockUseNovelActions(),
}));

jest.mock('@hooks/persisted', () => ({
  useChapterGeneralSettings: () => mockUseChapterGeneralSettings(),
  useLibrarySettings: () => mockUseLibrarySettings(),
  useTracker: () => mockUseTracker(),
  useTrackedNovel: (...args: unknown[]) => mockUseTrackedNovel(...args),
}));

jest.mock('@hooks', () => ({
  useFullscreenMode: () => mockUseFullscreenMode(),
}));

jest.mock('@database/queries/ChapterQueries', () => ({
  getChapter: (...args: unknown[]) => mockGetDbChapter(...args),
  getChapterCount: (...args: unknown[]) => mockGetChapterCount(...args),
  getNextChapter: (...args: unknown[]) => mockGetNextChapter(...args),
  getPrevChapter: (...args: unknown[]) => mockGetPrevChapter(...args),
  insertChapters: (...args: unknown[]) => mockInsertChapters(...args),
}));

jest.mock('@database/queries/HistoryQueries', () => ({
  insertHistory: (...args: unknown[]) => mockInsertHistory(...args),
}));

jest.mock('@services/plugin/fetch', () => ({
  fetchChapter: (...args: unknown[]) => mockFetchChapter(...args),
  fetchPage: (...args: unknown[]) => mockFetchPage(...args),
}));

jest.mock('../../utils/sanitizeChapterText', () => ({
  sanitizeChapterText: (...args: unknown[]) => mockSanitizeChapterText(...args),
}));

jest.mock('@utils/parseChapterNumber', () => ({
  parseChapterNumber: (...args: unknown[]) => mockParseChapterNumber(...args),
}));

jest.mock('expo-speech', () => ({
  stop: jest.fn(),
}));

const makeChapter = (id: number, page = '1') => ({
  id,
  novelId: 7,
  name: `Chapter ${id}`,
  path: `/chapter/${id}`,
  page,
  position: id,
  unread: true,
  isDownloaded: false,
  bookmark: false,
  progress: 0,
  releaseTime: '2026-01-01',
  updatedTime: '2026-01-01',
  readTime: '2026-01-01',
});

const makeNovel = () => ({
  id: 7,
  pluginId: 'plugin.reader',
  path: '/novel/test',
  name: 'Novel Test',
  totalPages: 3,
  inLibrary: true,
});

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const createStore = (
  cacheSeed: Record<number, string | Promise<string>> = {},
) => {
  const cache = new Map<number, string | Promise<string>>(
    Object.entries(cacheSeed).map(([k, v]) => [Number(k), v]),
  );
  const chapterTextCache = {
    read: jest.fn((chapterId: number) => cache.get(chapterId)),
    write: jest.fn((chapterId: number, value: string | Promise<string>) => {
      cache.set(chapterId, value);
    }),
    remove: jest.fn((chapterId: number) => {
      cache.delete(chapterId);
    }),
    clear: jest.fn(() => cache.clear()),
  };
  const state = {
    markChapterRead: jest.fn(),
    updateChapterProgress: jest.fn(),
    chapterTextCache,
    setLastRead: jest.fn(),
  };

  return {
    getState: () => state,
    subscribe: jest.fn(() => () => {}),
    state,
    chapterTextCache,
  };
};

describe('useChapter', () => {
  const initialChapter = makeChapter(1, '1');
  const nextChapter = makeChapter(2, '1');
  const novel = makeNovel();

  beforeEach(() => {
    jest.clearAllMocks();
    (NativeFile.exists as jest.Mock).mockReturnValue(false);
    (NativeFile.readFile as jest.Mock).mockReturnValue('');
    // Direct storage is off unless a test grants it, so the reader takes the
    // legacy/source path exactly like an unconfigured install.
    (NativeFile.hasAllFilesAccess as jest.Mock).mockReturnValue(false);

    mockUseChapterGeneralSettings.mockReturnValue({
      autoScroll: false,
      autoScrollInterval: 1,
      autoScrollOffset: 100,
      useVolumeButtons: false,
      volumeButtonsOffset: 100,
    });
    mockUseLibrarySettings.mockReturnValue({ incognitoMode: false });
    mockUseTracker.mockReturnValue({ tracker: { id: 'tracker' } });
    mockUseTrackedNovel.mockReturnValue({
      trackedNovel: { progress: 1 },
      updateAllTrackedNovels: jest.fn(),
    });
    mockUseFullscreenMode.mockReturnValue({
      setImmersiveMode: jest.fn(),
      showStatusAndNavBar: jest.fn(),
    });

    mockGetDbChapter.mockResolvedValue(initialChapter);
    mockGetChapterCount.mockResolvedValue(1);
    mockGetNextChapter.mockResolvedValue(undefined);
    mockGetPrevChapter.mockResolvedValue(undefined);
    mockInsertChapters.mockResolvedValue(undefined);
    mockInsertHistory.mockResolvedValue(undefined);
    mockFetchChapter.mockResolvedValue('chapter body');
    mockFetchPage.mockResolvedValue({ chapters: [] });
    mockSanitizeChapterText.mockImplementation(
      (
        _pluginId: string,
        _novelName: string,
        _chapterName: string,
        text: string,
      ) => `SANITIZED:${text}`,
    );
    mockParseChapterNumber.mockReturnValue(5);
  });

  it('uses chapterTextCache on initial load and avoids duplicate fetch for cached chapter text', async () => {
    const store = createStore({ [initialChapter.id]: 'cached chapter body' });
    mockUseNovelActions.mockReturnValue(store.state);

    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetchChapter).not.toHaveBeenCalled();
    expect(result.current.chapterText).toBe('SANITIZED:cached chapter body');
    expect(store.chapterTextCache.write).not.toHaveBeenCalledWith(
      initialChapter.id,
      expect.anything(),
    );
  });

  it('hydrates the initial chapter from the database before rendering reader progress', async () => {
    const store = createStore({ [initialChapter.id]: 'cached chapter body' });
    const hydratedChapter = { ...initialChapter, progress: 56 };
    mockUseNovelActions.mockReturnValue(store.state);
    mockGetDbChapter.mockResolvedValue(hydratedChapter);

    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.chapter.progress).toBe(56);
  });

  it('uses database progress as the source of truth on initial open', async () => {
    const routeChapter = { ...initialChapter, progress: 72 };
    const dbChapter = { ...initialChapter, progress: 12 };
    const store = createStore({ [initialChapter.id]: 'cached chapter body' });
    mockUseNovelActions.mockReturnValue(store.state);
    mockGetDbChapter.mockResolvedValue(dbChapter);

    const { result } = renderHook(() =>
      useChapter({ current: null }, routeChapter, novel),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.chapter.progress).toBe(12);
  });

  it('updates chapter progress, caps at 100, and marks chapter read/tracker progress near completion', async () => {
    const store = createStore();
    const updateAllTrackedNovels = jest.fn();
    mockUseTrackedNovel.mockReturnValue({
      trackedNovel: { progress: 2 },
      updateAllTrackedNovels,
    });
    mockUseNovelActions.mockReturnValue(store.state);

    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.saveProgress(40);
      result.current.saveProgress(130);
      result.current.saveProgress(-10);
      result.current.saveProgress(Number.NaN);
    });

    expect(store.state.updateChapterProgress).toHaveBeenNthCalledWith(
      1,
      initialChapter.id,
      40,
    );
    expect(store.state.updateChapterProgress).toHaveBeenNthCalledWith(
      2,
      initialChapter.id,
      100,
    );
    expect(store.state.updateChapterProgress).toHaveBeenNthCalledWith(
      3,
      initialChapter.id,
      0,
    );
    // NaN normalizes to 0, identical to the previous save, so the redundant
    // persistence write is skipped.
    expect(store.state.updateChapterProgress).toHaveBeenCalledTimes(3);
    expect(store.state.markChapterRead).toHaveBeenCalledTimes(1);
    expect(store.state.markChapterRead).toHaveBeenCalledWith(initialChapter.id);
    expect(mockParseChapterNumber).toHaveBeenCalledWith(
      novel.name,
      initialChapter.name,
    );
    expect(updateAllTrackedNovels).toHaveBeenCalledWith({ progress: 5 });
  });

  it('skips redundant persistence writes for repeated identical progress saves', async () => {
    const store = createStore();
    mockUseNovelActions.mockReturnValue(store.state);

    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    store.state.updateChapterProgress.mockClear();
    store.state.markChapterRead.mockClear();

    act(() => {
      result.current.saveProgress(40);
      result.current.saveProgress(40);
      result.current.saveProgress(40, initialChapter.id, 100);
      result.current.saveProgress(40, initialChapter.id, 100.9);
      result.current.saveProgress(100);
      result.current.saveProgress(100);
    });

    // Identical consecutive saves persist once; charOffset 100 and 100.9 both
    // normalize to 100 so the second is skipped; the repeated 100 skips both
    // the progress write and the mark-as-read write.
    expect(store.state.updateChapterProgress).toHaveBeenCalledTimes(3);
    expect(store.state.updateChapterProgress).toHaveBeenNthCalledWith(
      1,
      initialChapter.id,
      40,
    );
    expect(store.state.updateChapterProgress).toHaveBeenNthCalledWith(
      2,
      initialChapter.id,
      40,
      100,
    );
    expect(store.state.updateChapterProgress).toHaveBeenNthCalledWith(
      3,
      initialChapter.id,
      100,
    );
    expect(store.state.markChapterRead).toHaveBeenCalledTimes(1);
    expect(store.state.markChapterRead).toHaveBeenCalledWith(initialChapter.id);
  });

  it('sets error and remains stable when chapter fetch fails', async () => {
    const store = createStore();
    mockUseNovelActions.mockReturnValue(store.state);
    mockFetchChapter.mockRejectedValueOnce(new Error('network failed'));

    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    await waitFor(() => expect(result.current.error).toBe('network failed'));
    expect(result.current.loading).toBe(false);
    expect(result.current.chapterText).toBe('');
  });

  it('reuses prefetched promise cache to avoid duplicate concurrent fetches for same chapter', async () => {
    const store = createStore();
    mockUseNovelActions.mockReturnValue(store.state);

    const deferredNext = createDeferred<string>();

    mockGetNextChapter.mockImplementation(
      async (_novelId: number, position: number) =>
        position === initialChapter.position ? nextChapter : undefined,
    );
    mockFetchChapter.mockImplementation(
      async (_pluginId: string, path: string) => {
        if (path === nextChapter.path) {
          return deferredNext.promise;
        }

        return 'initial body';
      },
    );

    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const navPromise = result.current.getChapter(nextChapter);

    expect(
      mockFetchChapter.mock.calls.filter(
        ([, path]) => path === nextChapter.path,
      ),
    ).toHaveLength(1);

    await act(async () => {
      deferredNext.resolve('next body');
      await navPromise;
    });

    expect(result.current.chapter.id).toBe(nextChapter.id);
    expect(result.current.chapterText).toBe('SANITIZED:next body');
  });

  it('persists a target chapter offset before publishing its lastRead pointer', async () => {
    // Given: a base chapter is loaded and a separate target chapter is read.
    const targetChapter = makeChapter(2);
    const store = createStore({
      [initialChapter.id]: 'base body',
      [targetChapter.id]: 'target body',
    });
    const persistence = createDeferred<void>();
    store.state.updateChapterProgress.mockReturnValue(persistence.promise);
    mockGetDbChapter.mockImplementation(async id =>
      id === targetChapter.id ? targetChapter : initialChapter,
    );
    mockUseNovelActions.mockReturnValue(store.state);

    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    mockInsertHistory.mockClear();
    store.state.setLastRead.mockClear();

    // When: progress is saved for the infinite-scroll target.
    act(() => {
      result.current.saveProgress(40, targetChapter.id, 321);
    });

    // Then: persistence is awaited before history and lastRead work begins.
    expect(store.state.updateChapterProgress).toHaveBeenCalledWith(
      targetChapter.id,
      40,
      321,
    );
    expect(mockInsertHistory).not.toHaveBeenCalledWith(targetChapter.id);
    expect(store.state.setLastRead).not.toHaveBeenCalledWith(targetChapter);

    await act(async () => {
      persistence.resolve();
      await persistence.promise;
    });

    await waitFor(() =>
      expect(store.state.setLastRead).toHaveBeenCalledWith(targetChapter),
    );
    expect(mockInsertHistory).toHaveBeenCalledWith(targetChapter.id);
  });

  it('does not let a base chapter cleanup restore lastRead after a target save', async () => {
    // Given: base hydration is still pending while a target save completes.
    const targetChapter = makeChapter(2);
    const baseHydration = createDeferred<ReturnType<typeof makeChapter>>();
    const store = createStore({ [initialChapter.id]: 'base body' });
    mockGetDbChapter.mockImplementation(id =>
      id === targetChapter.id
        ? Promise.resolve(targetChapter)
        : baseHydration.promise,
    );
    mockUseNovelActions.mockReturnValue(store.state);

    const { result, unmount } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    // When: the target is saved and the reader then unmounts.
    act(() => {
      result.current.saveProgress(55, targetChapter.id, 17);
    });
    await waitFor(() =>
      expect(store.state.setLastRead).toHaveBeenCalledWith(targetChapter),
    );
    unmount();

    // Then: the late base read cannot publish the older chapter pointer.
    await act(async () => {
      baseHydration.resolve(initialChapter);
      await baseHydration.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(store.state.setLastRead).not.toHaveBeenCalledWith(initialChapter);
  });

  it('ignores initial chapter hydration that resolves after a newer chapter read', async () => {
    // Given: initial hydration is delayed while a newer chapter is loaded.
    const initialHydration = createDeferred<ReturnType<typeof makeChapter>>();
    const store = createStore({
      [initialChapter.id]: 'base body',
      [nextChapter.id]: 'next body',
    });
    mockGetDbChapter.mockImplementation(id =>
      id === initialChapter.id ? initialHydration.promise : nextChapter,
    );
    mockUseNovelActions.mockReturnValue(store.state);

    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    // When: the user navigates to the next chapter before hydration resolves.
    await act(async () => {
      await result.current.getChapter(nextChapter);
    });
    expect(result.current.chapter.id).toBe(nextChapter.id);

    // Then: the stale base hydration cannot replace the newer chapter.
    await act(async () => {
      initialHydration.resolve(initialChapter);
      await initialHydration.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.chapter.id).toBe(nextChapter.id);
  });

  it('keeps manual navigation progress and read marking on the selected chapter', async () => {
    // Given: the next chapter is available for manual navigation.
    const store = createStore({
      [initialChapter.id]: 'base body',
      [nextChapter.id]: 'next body',
    });
    mockGetNextChapter.mockImplementation(
      async (_novelId: number, position: number) =>
        position === initialChapter.position ? nextChapter : undefined,
    );
    mockGetDbChapter.mockImplementation(async id =>
      id === initialChapter.id ? initialChapter : nextChapter,
    );
    mockUseNovelActions.mockReturnValue(store.state);

    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // When: the user manually selects the next chapter and finishes it.
    act(() => {
      result.current.navigateChapter('NEXT');
    });
    await waitFor(() => expect(result.current.chapter.id).toBe(nextChapter.id));

    await act(async () => {
      await result.current.saveProgress(97);
    });

    // Then: the selected chapter receives progress and read state.
    expect(store.state.updateChapterProgress).toHaveBeenCalledWith(
      nextChapter.id,
      97,
    );
    expect(store.state.markChapterRead).toHaveBeenCalledWith(nextChapter.id);
    await waitFor(() =>
      expect(store.state.setLastRead).toHaveBeenCalledWith(nextChapter),
    );
  });

  it('reads a downloaded chapter off shared storage before the boot probe settles', async () => {
    // Given: all-files access is granted but the boot-time async probe has not
    // run, so the cached readiness flag is still unset.
    (NativeFile.hasAllFilesAccess as jest.Mock).mockReturnValue(true);
    (NativeFile.readFile as jest.Mock).mockReturnValue('<html>on disk</html>');
    const store = createStore();
    mockUseNovelActions.mockReturnValue(store.state);

    // When
    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, novel),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Then the chapter comes from the shared download root, not from the
    // network — which is the whole point for an offline reader.
    expect(NativeFile.readFile).toHaveBeenCalledWith(
      '/mock/storage/SoraReader/Novels/plugin.reader/7/1/index.html',
    );
    expect(mockFetchChapter).not.toHaveBeenCalled();
  });

  it('reads a local novel chapter from the shared tree instead of the gone legacy folder', async () => {
    // Given: a PDF/EPUB import that lives in the shared tree
    // (`Novels/local/{novelId}/{chapterId}/index.html`) while the legacy
    // app-private folder no longer exists.
    (NativeFile.hasAllFilesAccess as jest.Mock).mockReturnValue(true);
    (NativeFile.exists as jest.Mock).mockReturnValue(true);
    (NativeFile.readFile as jest.Mock).mockReturnValue(
      '<img class="pdf-page-image" src="0.b64.png"/>',
    );
    const store = createStore();
    mockUseNovelActions.mockReturnValue(store.state);
    const localNovel = { ...makeNovel(), pluginId: 'local', isLocal: true };

    // When
    const { result } = renderHook(() =>
      useChapter({ current: null }, initialChapter, localNovel),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Then the tree file wins and the legacy LocalPlugin read — which returns
    // '' for a missing folder and renders as "Chapter is empty" — is skipped.
    expect(NativeFile.readFile).toHaveBeenCalledWith(
      '/mock/storage/SoraReader/Novels/local/7/1/index.html',
    );
    expect(mockFetchChapter).not.toHaveBeenCalled();
    expect(result.current.chapterText).toBe(
      'SANITIZED:<img class="pdf-page-image" src="0.b64.png"/>',
    );
  });
});
