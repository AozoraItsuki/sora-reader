import { ErrorScreenV2 } from '@components';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { useBackHandler } from '@hooks/index';
import { useChapterGeneralSettings, useTheme } from '@hooks/persisted';
import { discordRPC } from '@modules/discord/DiscordRPC';
import { ChapterScreenProps } from '@navigators/types';
import { useFocusEffect } from '@react-navigation/native';
import { resolveUrl } from '@services/plugin/fetch';
import { getString } from '@strings/translations';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAllTermsForNovel } from '@utils/readerTerms';
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
  const { pageReader = false, keepScreenOn } = useChapterGeneralSettings();
  const [bookmarked, setBookmarked] = useState<boolean>(
    chapter.bookmark ?? false,
  );
  const [sheetTabIndex, setSheetTabIndex] = useState(0);
  const [sheetTabKey, setSheetTabKey] = useState(0);

  useEffect(() => {
    setBookmarked(chapter.bookmark ?? false);
  }, [chapter]);

  const { hidden, loading, error, webViewRef, hideHeader, refetch, novel: ctxNovel } =
    useChapterContext();

  const presentSheetAtTab = useCallback(
    (tabIndex: number) => {
      setSheetTabIndex(tabIndex);
      setSheetTabKey(k => k + 1);
      readerSheetRef.current?.present();
    },
    [],
  );

  const applyTermsToWebView = useCallback(() => {
    const novelId = ctxNovel?.id ?? 0;
    const terms = getAllTermsForNovel(novelId);
    const js = terms.length > 0
      ? `(function(){
          var chEl = document.getElementById('LNReader-chapter');
          if (!chEl) return;
          var walker = document.createTreeWalker(chEl, NodeFilter.SHOW_TEXT, null);
          var nodes = [];
          var n;
          while((n = walker.nextNode())) nodes.push(n);
          var terms = ${JSON.stringify(terms)};
          nodes.forEach(function(node) {
            var text = node.nodeValue;
            if (!text) return;
            terms.forEach(function(t) {
              if (!t.from) return;
              var escaped = t.from.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
              var flags = t.caseSensitive ? 'g' : 'gi';
              try { text = text.replace(new RegExp(escaped, flags), t.to); } catch(e) {}
            });
            node.nodeValue = text;
          });
        })()`
      : `(function(){})()`;
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

  const scrollToStart = () =>
    requestAnimationFrame(() => {
      webViewRef?.current?.injectJavaScript(
        !pageReader
          ? `(()=>{
                window.scrollTo({top:0,behavior:'smooth'})
              })()`
          : `(()=>{
              pageReader.movePage(0);
            })()`,
      );
    });

  const openDrawerI = useCallback(() => {
    openDrawer();
    hideHeader();
  }, [hideHeader, openDrawer]);

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
          <WebViewReader onPress={hideHeader} />
        </View>
      </ChapterLoadingScreen>
      <ReaderBottomSheetV2
        bottomSheetRef={readerSheetRef}
        initialTabIndex={sheetTabIndex}
        initialTabKey={sheetTabKey}
      />
      {!hidden && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <ReaderAppbar
            goBack={navigation.goBack}
            theme={theme}
            bookmarked={bookmarked}
            setBookmarked={setBookmarked}
          />
          <ReaderFooter
            readerSheetRef={readerSheetRef}
            scrollToStart={scrollToStart}
            navigation={navigation}
            openDrawer={openDrawerI}
            openEditTerms={() => {}}
            presentSheetAtTab={presentSheetAtTab}
            onApplyTerms={applyTermsToWebView}
          />
        </View>
      )}
    </View>
  );
};

export default Chapter;

const styles = StyleSheet.create({
  container: { flex: 1 },
});
