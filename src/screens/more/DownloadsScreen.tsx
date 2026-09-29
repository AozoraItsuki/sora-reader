import { Appbar, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import useDownload from '@hooks/persisted/useDownload';
import { DownloadsScreenProps } from '@navigators/types';
import { getString } from '@strings/translations';
import { showToast } from '@utils/showToast';
import Color from 'color';
import React, { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Appbar as MaterialAppbar } from 'react-native-paper';
import { TabBar, TabView } from 'react-native-tab-view';

import DownloadedTab from './components/DownloadedTab';
import QueueTab from './components/QueueTab';

const routes = [
  { key: 'downloadedRoute', title: getString('downloadScreen.downloaded') },
  { key: 'queueRoute', title: getString('downloadScreen.queue') },
];

const Downloads = ({ navigation }: DownloadsScreenProps) => {
  const theme = useTheme();
  const layout = useWindowDimensions();
  const { cancelDownload } = useDownload();

  const [index, setIndex] = useState(0);
  const [clearSignal, setClearSignal] = useState(0);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);

  const onDownloadedCountChange = useCallback(
    (count: number) => setDownloadedCount(count),
    [],
  );
  const onQueueCountChange = useCallback(
    (count: number) => setQueueCount(count),
    [],
  );

  const indicatorStyle = useMemo(
    () => ({ backgroundColor: theme.primary, height: 3 }),
    [theme.primary],
  );
  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: theme.surface,
      elevation: 0,
      borderBottomWidth: 1,
      borderBottomColor: Color(theme.isDark ? '#FFFFFF' : '#000000')
        .alpha(0.12)
        .string(),
    }),
    [theme.surface, theme.isDark],
  );

  const renderScene = useCallback(
    ({ route }: { route: { key: string } }) => {
      switch (route.key) {
        case 'queueRoute':
          return <QueueTab theme={theme} onCountChange={onQueueCountChange} />;
        default:
          return (
            <DownloadedTab
              theme={theme}
              clearSignal={clearSignal}
              onCountChange={onDownloadedCountChange}
            />
          );
      }
    },
    [theme, clearSignal, onDownloadedCountChange, onQueueCountChange],
  );

  const renderTabBar = useCallback(
    (props: any) => (
      <TabBar
        {...props}
        indicatorStyle={indicatorStyle}
        style={tabBarStyle}
        inactiveColor={theme.secondary}
        activeColor={theme.primary}
        android_ripple={{ color: theme.rippleColor }}
      />
    ),
    [
      indicatorStyle,
      tabBarStyle,
      theme.secondary,
      theme.primary,
      theme.rippleColor,
    ],
  );

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('common.downloads')}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        {index === 0 && downloadedCount > 0 ? (
          <MaterialAppbar.Action
            icon="delete-sweep"
            iconColor={theme.onSurface}
            onPress={() => setClearSignal(signal => signal + 1)}
          />
        ) : null}
        {index === 1 && queueCount > 0 ? (
          <MaterialAppbar.Action
            icon="close"
            iconColor={theme.onSurface}
            onPress={() => {
              cancelDownload();
              showToast(getString('downloadScreen.cancelled'));
            }}
          />
        ) : null}
      </Appbar>
      <TabView
        navigationState={{ index, routes }}
        initialLayout={{ width: layout.width }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        renderTabBar={renderTabBar}
      />
    </SafeAreaView>
  );
};

export default Downloads;
