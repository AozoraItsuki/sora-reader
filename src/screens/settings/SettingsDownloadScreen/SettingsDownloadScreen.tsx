import { Appbar, List, SafeAreaView } from '@components';
import { useBoolean } from '@hooks';
import {
  useAppSettings,
  useDownloadSettings,
  useTheme,
} from '@hooks/persisted';
import { defaultProxyConfig, ProxyMode } from '@hooks/persisted/useSettings';
import { DownloadSettingsScreenProps } from '@navigators/types';
import { runSafMigration } from '@services/saf/migrateToSaf';
import { SAF_TREE_ROOT, safMkdir, setSafTreeUri } from '@services/saf/safFile';
import { syncSafTreeUriToServer } from '@services/saf/useSafLocation';
import { getString } from '@strings/translations';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { applyNativeProxy, clearNativeProxy } from '@utils/nativeProxy';
import { showToast } from '@utils/showToast';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { openDocumentTree } from 'react-native-saf-x';

import SettingSwitch from '../components/SettingSwitch';
import ChapterDelayModal from './modals/ChapterDelayModal';
import ParallelChaptersCountModal from './modals/ParallelChaptersCountModal';
import ProxySettingsModal from './modals/ProxySettingsModal';
import RetryDelayModal from './modals/RetryDelayModal';

/** Display name of the picked download folder (the tree URI has no label). */
const DOWNLOAD_FOLDER_NAME_KEY = 'SAF_TREE_DISPLAY_NAME';

const PROXY_MODE_LABELS: Record<ProxyMode, string> = {
  disabled: getString('downloadSettingsScreen.proxyDisabled'),
  http: 'HTTP / HTTPS',
  socks5: 'SOCKS5',
  tor: 'Tor',
};

const SettingsDownloadScreen = ({
  navigation,
}: DownloadSettingsScreenProps) => {
  const theme = useTheme();

  const { downloadNewChapters, setAppSettings } = useAppSettings();

  const {
    parallelChaptersEnabled,
    parallelChaptersCount,
    parallelNovelsEnabled,
    retryOnError,
    retryDelaySeconds,
    chapterDelaySeconds,
    proxyEnabled,
    proxy,
    setDownloadSettings,
  } = useDownloadSettings();

  const parallelChaptersCountModal = useBoolean();
  const proxySettingsModal = useBoolean();
  const retryDelayModal = useBoolean();
  const chapterDelayModal = useBoolean();

  // A tree URI carries no readable label, so the picked folder's display name is
  // kept next to it for this row.
  const [downloadFolderName, setDownloadFolderName] = useState(
    () => MMKVStorage.getString(DOWNLOAD_FOLDER_NAME_KEY) || '',
  );

  const handlePickDownloadFolder = useCallback(async () => {
    try {
      const picked = await openDocumentTree(true);
      if (!picked) {
        return;
      }
      setSafTreeUri(picked.uri);
      syncSafTreeUriToServer();
      MMKVStorage.set(DOWNLOAD_FOLDER_NAME_KEY, picked.name);
      setDownloadFolderName(picked.name);
      // Make sure the tree the server walks into exists, then move whatever is
      // still in the old app-private location into it.
      await safMkdir(SAF_TREE_ROOT);
      await runSafMigration();
    } catch (error: any) {
      showToast(error?.message || String(error));
    }
  }, []);

  const mergedProxy = { ...defaultProxyConfig, ...proxy };
  const proxyModeLabel =
    PROXY_MODE_LABELS[mergedProxy.mode] ??
    getString('downloadSettingsScreen.proxyDisabled');

  const handleToggleProxy = () => {
    const next = !proxyEnabled;
    setDownloadSettings({ proxyEnabled: next });
    if (next) {
      applyNativeProxy(mergedProxy);
    } else {
      clearNativeProxy();
    }
  };

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
            {getString('downloadSettingsScreen.downloadLocation')}
          </List.SubHeader>
          <List.Item
            title={getString('downloadSettingsScreen.downloadFolder')}
            description={
              downloadFolderName
                ? `${getString(
                    'downloadSettingsScreen.downloadFolderDesc',
                  )}\n${downloadFolderName}`
                : getString('downloadSettingsScreen.downloadFolderNotSet')
            }
            onPress={handlePickDownloadFolder}
            theme={theme}
          />
          <List.InfoItem
            title={getString(
              'downloadSettingsScreen.downloadFolderMigrationNote',
            )}
            theme={theme}
          />
        </List.Section>
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
            description={getString(
              'downloadSettingsScreen.parallelChaptersDesc',
            )}
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
          <List.Item
            title={getString('downloadSettingsScreen.chapterDelay')}
            description={
              (chapterDelaySeconds ?? 0) === 0
                ? getString('downloadSettingsScreen.chapterDelayNone')
                : getString('downloadSettingsScreen.chapterDelayOption', {
                    seconds: chapterDelaySeconds ?? 0,
                  })
            }
            onPress={chapterDelayModal.setTrue}
            theme={theme}
          />
          <SettingSwitch
            label={getString('downloadSettingsScreen.retryOnError')}
            description={getString('downloadSettingsScreen.retryOnErrorDesc')}
            value={retryOnError}
            onPress={() => setDownloadSettings({ retryOnError: !retryOnError })}
            theme={theme}
          />
          {retryOnError && (
            <List.Item
              title={getString('downloadSettingsScreen.retryDelay')}
              description={getString(
                'downloadSettingsScreen.retryDelayOption',
                { seconds: retryDelaySeconds ?? 60 },
              )}
              onPress={retryDelayModal.setTrue}
              theme={theme}
            />
          )}
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('downloadSettingsScreen.proxy')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('downloadSettingsScreen.proxyEnable')}
            description={getString('downloadSettingsScreen.proxyEnableDesc')}
            value={proxyEnabled}
            onPress={handleToggleProxy}
            theme={theme}
          />
          <List.Item
            title={getString('downloadSettingsScreen.proxySettings')}
            description={
              proxyEnabled
                ? proxyModeLabel
                : getString('downloadSettingsScreen.proxyDisabled')
            }
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
      <RetryDelayModal
        retryDelaySeconds={retryDelaySeconds ?? 60}
        modalVisible={retryDelayModal.value}
        hideModal={retryDelayModal.setFalse}
        theme={theme}
      />
      <ChapterDelayModal
        chapterDelaySeconds={chapterDelaySeconds ?? 0}
        modalVisible={chapterDelayModal.value}
        hideModal={chapterDelayModal.setFalse}
        theme={theme}
      />
    </SafeAreaView>
  );
};

export default SettingsDownloadScreen;

const styles = StyleSheet.create({
  paddingBottom: { paddingBottom: 32 },
});
