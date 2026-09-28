import { ErrorScreenV2 } from '@components';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { useBackHandler } from '@hooks/index';
import { useChapterGeneralSettings, useTheme } from '@hooks/persisted';
import { discordRPC } from '@modules/discord/DiscordRPC';
import { ChapterScreenProps } from '@navigators/types';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useFocusEffect } from '@react-navigation/native';
import { resolveUrl } from '@services/plugin/fetch';
import { getString } from '@strings/translations';
import { buildApplyTermsJs,getAllTermsForNovel } from '@utils/readerTerms';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, ToastAndroid, View } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChapterContextProvider, useChapterContext } from './ChapterContext';
import ChapterLoadingScreen from './ChapterLoadingScreen/ChapterLoadingScreen';
import ChapterDrawer from './components/ChapterDrawer';
import KeepScreenAwake from './components/KeepScreenAwake';
import ReaderAppbar from './components/ReaderAppbar';
import ReaderBottomSheetV2 from './components/ReaderBottomSheet/ReaderBottomSheet';
import ReaderFooter from './components/ReaderFooter';
import WebViewReader from './components/WebViewReader';

const Chapter = ({ route, navigation }: ChapterScreenProps) => {
  const [open, setOpen] = useState(false);

  useBackHandler(() => {
    if (open) {
      setOpen(false);
      return true;
    }
    return false;
  });

  const openDrawer = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <ChapterContextProvider
      novel={route.params.novel}
      initialChapter={route.params.chapter}
    >
      <Drawer
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        renderDrawerContent={() => <ChapterDrawer />}
      >
        <ChapterContent
          route={route}
          navigation={navigation}
          openDrawer={openDrawer}
        />
      </Drawer>
    </ChapterContextProvider>
  );
};

type ChapterContentProps = ChapterScreenProps & {
  openDrawer: () => void;
};

export const ChapterContent = ({
  navigation,
  openDrawer,
}: ChapterContentProps) => {
  const { left, right } = useSafeAreaInsets();
  const { novel, chapter } = useChapterContext();
  const readerSheetRef = useRef<BottomSheetModalMethods>(null);
  const theme = useTheme();
  const { keepScreenOn } = useChapterGeneralSettings();
  const [bookmarked, setBookmarked] = useState<boolean>(
    chapter.bookmark ?? false,
  );
  const [locked, setLocked] = useState(false);
  const [lockBtnVisible, setLockBtnVisible] = useState(false);
  const lastBackPressRef = useRef<number>(0);

  useEffect(() => {
    setBookmarked(chapter.bookmark ?? false);
  }, [chapter]);

  const { hidden, loading, error, webViewRef, hideHeader, refetch, novel: ctxNovel } =
    useChapterContext();

  useBackHandler(() => {
    if (locked) {
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        navigation.goBack();
        return true;
      }
      lastBackPressRef.current = now;
      ToastAndroid.show(getString('readerScreen.lockScreen.tapBackToExit'), ToastAndroid.SHORT);
      return true;
    }
    return false;
  });

  const applyTermsToWebView = useCallback(() => {
    const novelId = ctxNovel?.id ?? 0;
    const terms = getAllTermsForNovel(novelId);
    const js = buildApplyTermsJs(terms);
    webViewRef?.current?.injectJavaScript(js);
  }, [ctxNovel?.id, webViewRef]);

  useFocusEffect(
    useCallback(() => {
      if (novel && chapter) {
        const url = resolveUrl(novel.pluginId, chapter.path);
        discordRPC.setReadingChapter(
          novel.name,
          chapter.name,
          getString('discord.readChapter'),
          novel?.cover,
          url,
          chapter.page,
        );
      }
    }, [novel, chapter]),
  );

  const openDrawerI = useCallback(() => {
    openDrawer();
    hideHeader();
  }, [hideHeader, openDrawer]);

  const handleUnlock = useCallback(() => {
    setLocked(false);
    setLockBtnVisible(false);
    ToastAndroid.show(getString('readerScreen.lockScreen.screenUnlocked'), ToastAndroid.SHORT);
  }, []);

  const handleToggleLock = useCallback(() => {
    const next = !locked;
    setLocked(next);
    if (next) {
      setLockBtnVisible(true);
      lastBackPressRef.current = 0;
      hideHeader();
      ToastAndroid.show(getString('readerScreen.lockScreen.screenLocked'), ToastAndroid.SHORT);
    } else {
      setLockBtnVisible(false);
      ToastAndroid.show(getString('readerScreen.lockScreen.screenUnlocked'), ToastAndroid.SHORT);
    }
  }, [locked, hideHeader]);

  const handleLockScreenTap = useCallback(() => {
    setLockBtnVisible(v => !v);
  }, []);

  const handleLockScreenScroll = useCallback(() => {
    setLockBtnVisible(false);
  }, []);

  // After every hook: an earlier return would unbalance the hook order when
  // `error` flips between renders.
  if (error) {
    return (
      <ErrorScreenV2
        error={error}
        actions={[
          {
            iconName: 'refresh',
            title: getString('common.retry'),
            onPress: refetch,
          },
          {
            iconName: 'earth',
            title: 'WebView',
            onPress: () =>
              navigation.navigate('WebviewScreen', {
                name: novel.name,
                url: chapter.path,
                pluginId: novel.pluginId,
              }),
          },
        ]}
      />
    );
  }

  return (
    <View style={[{ paddingStart: left, paddingEnd: right }, styles.container]}>
      {keepScreenOn ? <KeepScreenAwake /> : null}
      <ChapterLoadingScreen isLoading={loading}>
        <View style={styles.container}>
          <WebViewReader
            onPress={locked ? handleLockScreenTap : hideHeader}
            onScroll={locked ? handleLockScreenScroll : undefined}
          />
        </View>
      </ChapterLoadingScreen>
      <ReaderBottomSheetV2
        bottomSheetRef={readerSheetRef}
        initialTabIndex={0}
        initialTabKey={0}
      />
      {!hidden && !locked && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <ReaderAppbar
            goBack={navigation.goBack}
            theme={theme}
            bookmarked={bookmarked}
            setBookmarked={setBookmarked}
            locked={locked}
            onToggleLock={handleToggleLock}
          />
          <ReaderFooter
            navigation={navigation}
            openDrawer={openDrawerI}
            onApplyTerms={applyTermsToWebView}
          />
        </View>
      )}
      {locked && lockBtnVisible && (
        <View style={styles.lockOverlay} pointerEvents="box-none">
          <Pressable
            style={[styles.unlockBtn, { backgroundColor: theme.surface }]}
            onPress={handleUnlock}
            android_ripple={{ color: theme.rippleColor, borderless: true, radius: 28 }}
          >
            <MaterialCommunityIcons name="lock" size={22} color={theme.primary} />
          </Pressable>
        </View>
      )}
    </View>
  );
};

export default Chapter;

const styles = StyleSheet.create({
  container: { flex: 1 },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 20,
    paddingBottom: 40,
  },
  unlockBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    opacity: 0.85,
  },
});
