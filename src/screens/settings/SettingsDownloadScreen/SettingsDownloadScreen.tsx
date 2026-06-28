import { Appbar, List, SafeAreaView } from '@components';
import { useBoolean } from '@hooks';
import {
  useAppSettings,
  useDownloadSettings,
  useTheme,
} from '@hooks/persisted';
import { defaultProxyConfig, ProxyMode } from '@hooks/persisted/useSettings';
import { DownloadSettingsScreenProps } from '@navigators/types';
import { getString } from '@strings/translations';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import SettingSwitch from '../components/SettingSwitch';
import ParallelChaptersCountModal from './modals/ParallelChaptersCountModal';
import ProxySettingsModal from './modals/ProxySettingsModal';

const PROXY_MODE_LABELS: Record<ProxyMode, string> = {
  disabled: getString('downloadSettingsScreen.proxyDisabled'),
  http: 'HTTP / HTTPS',
  socks5: 'SOCKS5',
  tor: 'Tor',
};

const SettingsDownloadScreen = ({ navigation }: DownloadSettingsScreenProps) => {
  const theme = useTheme();

  const { downloadNewChapters, setAppSettings } = useAppSettings();

  const {
    parallelChaptersEnabled,
    parallelChaptersCount,
    parallelNovelsEnabled,
    retryOnError,
    proxy,
    setDownloadSettings,
  } = useDownloadSettings();

  const parallelChaptersCountModal = useBoolean();
  const proxySettingsModal = useBoolean();

  const mergedProxy = { ...defaultProxyConfig, ...proxy };
  const proxyModeLabel = PROXY_MODE_LABELS[mergedProxy.mode] ?? getString('downloadSettingsScreen.proxyDisabled');

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('downloadSettings')}
        handleGoBack={() => navigation.goBack()}
        theme={theme}
      />
      <ScrollView contentContainerStyle={styles.paddingBottom}>
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('downloadSettingsScreen.autoDownload')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('downloadSettingsScreen.downloadNewChapters')}
            value={downloadNewChapters}
            onPress={() =>
              setAppSettings({ downloadNewChapters: !downloadNewChapters })
            }
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('downloadSettingsScreen.parallelDownload')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('downloadSettingsScreen.parallelChapters')}
            description={getString('downloadSettingsScreen.parallelChaptersDesc')}
            value={parallelChaptersEnabled}
            onPress={() =>
              setDownloadSettings({
                parallelChaptersEnabled: !parallelChaptersEnabled,
              })
            }
            theme={theme}
          />
          {parallelChaptersEnabled && (
            <List.Item
              title={getString('downloadSettingsScreen.parallelChaptersCount')}
              description={parallelChaptersCount.toString()}
              onPress={parallelChaptersCountModal.setTrue}
              theme={theme}
            />
          )}
          <SettingSwitch
            label={getString('downloadSettingsScreen.parallelNovels')}
            description={getString('downloadSettingsScreen.parallelNovelsDesc')}
            value={parallelNovelsEnabled}
            onPress={() =>
              setDownloadSettings({
                parallelNovelsEnabled: !parallelNovelsEnabled,
              })
            }
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('downloadSettingsScreen.errorHandling')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('downloadSettingsScreen.retryOnError')}
            description={getString('downloadSettingsScreen.retryOnErrorDesc')}
            value={retryOnError}
            onPress={() =>
              setDownloadSettings({ retryOnError: !retryOnError })
            }
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('downloadSettingsScreen.proxy')}
          </List.SubHeader>
          <List.Item
            title={getString('downloadSettingsScreen.proxyMode')}
            description={proxyModeLabel}
            onPress={proxySettingsModal.setTrue}
            theme={theme}
          />
        </List.Section>
      </ScrollView>
      <ParallelChaptersCountModal
        parallelChaptersCount={parallelChaptersCount}
        modalVisible={parallelChaptersCountModal.value}
        hideModal={parallelChaptersCountModal.setFalse}
        theme={theme}
      />
      <ProxySettingsModal
        visible={proxySettingsModal.value}
        onDismiss={proxySettingsModal.setFalse}
        theme={theme}
      />
    </SafeAreaView>
  );
};

export default SettingsDownloadScreen;

const styles = StyleSheet.create({
  paddingBottom: { paddingBottom: 32 },
});
