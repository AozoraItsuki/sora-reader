import { Appbar, List, SafeAreaView } from '@components';
import { useBoolean } from '@hooks';
import {
  useAppSettings,
  useDownloadSettings,
  useTheme,
} from '@hooks/persisted';
import { defaultProxyConfig, ProxyMode } from '@hooks/persisted/useSettings';
import { DownloadSettingsScreenProps } from '@navigators/types';
import {
  hasLegacyDownloads,
  runSafMigration,
} from '@services/saf/migrateToSaf';
import {
  ensureDirectStorage,
  isDirectStorageReady,
} from '@services/saf/safFile';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import { applyNativeProxy, clearNativeProxy } from '@utils/nativeProxy';
import { showToast } from '@utils/showToast';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProgressBar } from 'react-native-paper';

import SettingSwitch from '../components/SettingSwitch';
import ChapterDelayModal from './modals/ChapterDelayModal';
import ParallelChaptersCountModal from './modals/ParallelChaptersCountModal';
import ProxySettingsModal from './modals/ProxySettingsModal';
import RetryDelayModal from './modals/RetryDelayModal';

/** How far the migration has got: files moved, files to move, current one. */
type MigrationProgress = { done: number; total: number; label: string };

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

  // The all-files grant survives reboots but not a revoke from system
  // settings, so it is re-probed on every visit.
  const [directAccess, setDirectAccess] = useState(isDirectStorageReady);
  const [legacyDetected, setLegacyDetected] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);

  useEffect(() => {
    setLegacyDetected(hasLegacyDownloads());
    // The all-files grant survives reboots but not a revoke from system
    // settings, so the row has to be told about it on every visit.
    void ensureDirectStorage().then(setDirectAccess);
  }, []);

  const handleGrantDirectAccess = useCallback(async () => {
    try {
      NativeFile.openAllFilesAccessSettings();
      setDirectAccess(await ensureDirectStorage());
    } catch (error: any) {
      showToast(error?.message || String(error));
    }
  }, []);

  const handleMigrateLegacy = useCallback(async () => {
    if (migrating) {
      return;
    }
    setMigrating(true);
    try {
      // Forced: a run that already finished and marked itself done is exactly
      // the one the user is asking to re-run from this button.
      await runSafMigration(
        (done, total, label) => setProgress({ done, total, label }),
        true,
      );
      setLegacyDetected(hasLegacyDownloads());
      showToast(getString('downloadSettingsScreen.migrateDone'));
    } catch (error: any) {
      showToast(error?.message || String(error));
    } finally {
      setMigrating(false);
      setProgress(null);
    }
  }, [migrating]);

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
            description={`${getString(
              'downloadSettingsScreen.downloadFolderDesc',
            )}\n${getString(
              'downloadSettingsScreen.downloadFolderShared',
            )}${
              directAccess
                ? ''
                : ` — ${getString(
                    'downloadSettingsScreen.downloadFolderAccessLost',
                  )}`
            }`}
            onPress={handleGrantDirectAccess}
            theme={theme}
          />
          <List.InfoItem
            title={getString(
              'downloadSettingsScreen.downloadFolderMigrationNote',
            )}
            theme={theme}
          />
          <List.Item
            title={getString('downloadSettingsScreen.migrateFiles')}
            description={
              migrating
                ? getString('downloadSettingsScreen.migrating')
                : legacyDetected
                ? getString('downloadSettingsScreen.migrateFilesDesc')
                : getString('downloadSettingsScreen.migrateNothingToMove')
            }
            onPress={handleMigrateLegacy}
            disabled={!legacyDetected || migrating}
            theme={theme}
          />
          {progress !== null && (
            <View style={styles.progress}>
              <Text style={{ color: theme.onSurfaceVariant }}>
                {getString(
                  'downloadSettingsScreen.migratingProgress',
                  progress,
                )}
              </Text>
              <Text style={[styles.progressLabel, { color: theme.onSurface }]}>
                {progress.label}
              </Text>
              <ProgressBar
                progress={progress.done / progress.total}
                color={theme.primary}
                style={{ backgroundColor: theme.surface2 }}
              />
            </View>
          )}
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
  progress: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressLabel: {
    fontSize: 12,
  },
});
