import { Appbar, List, SafeAreaView, SwitchItem } from '@components';
import { useBoolean } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { useBackupOptions } from '@hooks/persisted/useBackupOptions';
import { BackupSettingsScreenProps } from '@navigators/types';
import ServiceManager from '@services/ServiceManager';
import { getString } from '@strings/translations';
import React from 'react';
import { StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import BackupLogModal from './Components/BackupLogModal';
import GoogleDriveModal from './Components/GoogleDriveModal';
import SelfHostModal from './Components/SelfHostModal';

const BackupSettings = ({ navigation }: BackupSettingsScreenProps) => {
  const theme = useTheme();
  const {
    value: googleDriveModalVisible,
    setFalse: closeGoogleDriveModal,
    setTrue: openGoogleDriveModal,
  } = useBoolean();

  const {
    value: selfHostModalVisible,
    setFalse: closeSelfHostModal,
    setTrue: openSelfHostModal,
  } = useBoolean();

  const {
    backupNovels,
    backupCategories,
    backupRepositories,
    backupSettings,
    setBackupOptions,
  } = useBackupOptions();

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('common.backup')}
        handleGoBack={() => navigation.goBack()}
        theme={theme}
      />
      <ScrollView style={styles.paddingBottom}>
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('backupScreen.backupSections')}
          </List.SubHeader>
          <SwitchItem
            label={getString('backupScreen.includeNovels')}
            description={getString('backupScreen.includeNovelsDesc')}
            value={backupNovels}
            onPress={() => setBackupOptions({ backupNovels: !backupNovels })}
            theme={theme}
          />
          <SwitchItem
            label={getString('backupScreen.includeCategories')}
            description={getString('backupScreen.includeCategoriesDesc')}
            value={backupCategories}
            onPress={() =>
              setBackupOptions({ backupCategories: !backupCategories })
            }
            theme={theme}
          />
          <SwitchItem
            label={getString('backupScreen.includeRepositories')}
            description={getString('backupScreen.includeRepositoriesDesc')}
            value={backupRepositories}
            onPress={() =>
              setBackupOptions({ backupRepositories: !backupRepositories })
            }
            theme={theme}
          />
          <SwitchItem
            label={getString('backupScreen.includeSettings')}
            description={getString('backupScreen.includeSettingsDesc')}
            value={backupSettings}
            onPress={() =>
              setBackupOptions({ backupSettings: !backupSettings })
            }
            theme={theme}
          />
        </List.Section>
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('backupScreen.remoteBackup')}
          </List.SubHeader>
          <List.Item
            title={getString('backupScreen.selfHost')}
            description={getString('backupScreen.selfHostDesc')}
            theme={theme}
            onPress={openSelfHostModal}
          />

          <List.Item
            title={getString('backupScreen.googeDrive')}
            description={getString('backupScreen.googeDriveDesc')}
            theme={theme}
            onPress={openGoogleDriveModal}
            // TODO: add google drive support
            disabled
          />
          <List.SubHeader theme={theme}>
            {getString('backupScreen.localBackup')}
          </List.SubHeader>
          <List.Item
            title={getString('backupScreen.createBackup')}
            description={getString('backupScreen.createBackupDesc')}
            onPress={() => {
              ServiceManager.manager.addTask({ name: 'LOCAL_BACKUP' });
            }}
            theme={theme}
          />
          <List.Item
            title={getString('backupScreen.restoreBackup')}
            description={getString('backupScreen.restoreBackupDesc')}
            onPress={() => {
              ServiceManager.manager.addTask({ name: 'LOCAL_RESTORE' });
            }}
            theme={theme}
          />
          <List.InfoItem
            title={getString('backupScreen.restoreLargeBackupsWarning')}
            theme={theme}
          />
          <List.InfoItem
            title={getString('backupScreen.createBackupWarning')}
            theme={theme}
          />
        </List.Section>
      </ScrollView>
      <GoogleDriveModal
        visible={googleDriveModalVisible}
        theme={theme}
        closeModal={closeGoogleDriveModal}
      />
      <SelfHostModal
        theme={theme}
        visible={selfHostModalVisible}
        closeModal={closeSelfHostModal}
      />
      {/* Auto-shows when backup/restore tasks are running */}
      <BackupLogModal theme={theme} />
    </SafeAreaView>
  );
};

export default BackupSettings;

const styles = StyleSheet.create({
  paddingBottom: { paddingBottom: 40 },
});
