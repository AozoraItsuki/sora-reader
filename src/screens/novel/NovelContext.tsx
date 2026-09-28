import { useLibraryContext } from '@components/Context/LibraryContext';
import { NovelInfo } from '@database/types';
import { useDeviceOrientation } from '@hooks/index';
import { useAppSettings } from '@hooks/persisted';
import { createStore } from '@hooks/persisted/useNovel/store/createStore';
import {
  NovelStoreActions,
  NovelStoreApi,
  NovelStoreData,
  NovelStoreState,
} from '@hooks/persisted/useNovel/store/novelStore.types';
import { ReaderStackParamList } from '@navigators/types';
import { RouteProp } from '@react-navigation/native';
import React, { createContext, useContext, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';

type Props = {
  children: React.ReactNode;
  route:
    | RouteProp<ReaderStackParamList, 'Novel'>
    | RouteProp<ReaderStackParamList, 'Chapter'>;
};

type NovelLayout = {
  navigationBarHeight: number;
  statusBarHeight: number;
};

const NovelStoreContext = createContext<NovelStoreApi | null>(null);
const NovelLayoutContext = createContext<NovelLayout | null>(null);

export function NovelContextProvider({ children, route }: Props) {
  const initialNovel =
    'id' in route.params ? (route.params as NovelInfo) : undefined;

  const { path, pluginId } =
    'novel' in route.params ? route.params.novel : route.params;
  const storeKey = `${pluginId}:${path}`;

  const { switchNovelToLibrary } = useLibraryContext();
  const { defaultChapterSort } = useAppSettings();

  const switchNovelToLibraryRef = useRef(switchNovelToLibrary);

  const storeRef = useRef<{
    key: string;
    store: NovelStoreApi;
  } | null>(null);
  const queriedNovelRef = useRef<boolean>(false);

  if (storeRef.current?.key !== storeKey) {
    queriedNovelRef.current = false;

    storeRef.current = {
      key: storeKey,
      store: createStore({
        path,
        pluginId,
        novel: initialNovel,
        defaultChapterSort,
        switchNovelToLibrary: switchNovelToLibraryRef.current,
      }),
    };
  }
  const novelStore = storeRef.current.store;

  const { bottom, top } = useSafeAreaInsets();
  const orientation = useDeviceOrientation();

  // Safe-area readings can transiently report 0 (insets not measured yet,
  // gesture navigation, or the frame right after a rotation). Keep the last
  // non-zero reading for the *current* orientation as a fallback so overlays
  // never sit flush against the screen edge, but let a rotation reset that
  // memory so the values follow the new screen size instead of ratcheting up
  // monotonically for the lifetime of the screen.
  const lastNonZeroInsets = useRef({ orientation, bottom: 0, top: 0 });

  if (lastNonZeroInsets.current.orientation !== orientation) {
    lastNonZeroInsets.current = { orientation, bottom, top };
  } else {
    if (bottom > 0) {
      lastNonZeroInsets.current.bottom = bottom;
    }
    if (top > 0) {
      lastNonZeroInsets.current.top = top;
    }
  }

  const layoutValue = {
    navigationBarHeight: bottom || lastNonZeroInsets.current.bottom,
    statusBarHeight: top || lastNonZeroInsets.current.top,
  };
  return (
    <NovelStoreContext.Provider value={novelStore}>
      <NovelLayoutContext.Provider value={layoutValue}>
        {children}
      </NovelLayoutContext.Provider>
    </NovelStoreContext.Provider>
  );
}

function useNovelStoreApi() {
  const store = useContext(NovelStoreContext);

  if (!store) {
    throw new Error('useNovelStore must be used inside NovelContextProvider');
  }

  return store;
}

export function useNovelStore<T>(selector: (state: NovelStoreState) => T): T {
  const store = useNovelStoreApi();
  return useStore(store, selector);
}

export function useNovelState<T>(selector: (state: NovelStoreData) => T): T {
  return useNovelStore(state => selector(state));
}

export function useNovelValue<K extends keyof NovelStoreData>(
  key: K,
): NovelStoreData[K] {
  return useNovelStore(state => state[key]);
}

export function useNovelActions(): NovelStoreActions {
  return useNovelStore(state => state.actions);
}

export function useNovelAction<K extends keyof NovelStoreActions>(
  key: K,
): NovelStoreActions[K] {
  return useNovelStore(state => state.actions[key]);
}

export function useNovelLayout() {
  const context = useContext(NovelLayoutContext);

  if (!context) {
    throw new Error('useNovelLayout must be used inside NovelContextProvider');
  }

  return context;
}
