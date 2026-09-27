import { Button, List, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import {
  hasLegacyDownloads,
  runSafMigration,
} from '@services/saf/migrateToSaf';
import { SAF_TREE_ROOT, safMkdir, setSafTreeUri } from '@services/saf/safFile';
import { syncSafTreeUriToServer } from '@services/saf/useSafLocation';
import { getString } from '@strings/translations';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProgressBar } from 'react-native-paper';
import { openDocumentTree } from 'react-native-saf-x';

/** Set to '1' once the user picked a folder or explicitly skipped this screen. */
export const SETUP_STORAGE_DISMISSED = 'SETUP_STORAGE_DISMISSED';

/**
 * Display name of the picked download folder. Same key `SettingsDownloadScreen`
 * reads, so a folder chosen here shows up on its download-folder row too.
 */
const DOWNLOAD_FOLDER_NAME_KEY = 'SAF_TREE_DISPLAY_NAME';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** How far the migration has got: files moved, files to move, current one. */
type MigrationProgress = { done: number; total: number; label: string };

interface SetupStorageScreenProps {
  /** Called once a folder is configured or the user skipped setup. */
  onDone: () => void;
}

/**
 * First-run storage setup: the app cannot download anything until the user
 * points it at a folder, so this blocks the library until then (or until the
 * user says they do not want to pick one right now).
 */
const SetupStorageScreen = ({ onDone }: SetupStorageScreenProps) => {
  const theme = useTheme();

  // A native directory listing on every render would be wasteful, and the
  // legacy folder cannot grow while this screen is up.
  const [hasLegacyFiles] = useState(hasLegacyDownloads);
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);

  const handleChooseFolder = useCallback(async () => {
    try {
      const picked = await openDocumentTree(true);
      if (!picked) {
        return;
      }
      setSafTreeUri(picked.uri);
      syncSafTreeUriToServer();
      MMKVStorage.set(DOWNLOAD_FOLDER_NAME_KEY, picked.name);
      // Make sure the tree the server walks into exists, then move whatever is
      // still in the old app-private location into it.
      await safMkdir(SAF_TREE_ROOT);
      await runSafMigration();
      onDone();
    } catch (error) {
      showToast(errorMessage(error));
    }
  }, [onDone]);

  const handleMigrateFiles = useCallback(async () => {
    if (migrating) {
      return;
    }
    setMigrating(true);
    try {
      // Choosing a folder already migrates; this retries a run that could not
      // finish, which deliberately leaves the legacy tree in place. It forces
      // the run so a migration already marked done can be re-run by hand too.
      await runSafMigration(
        (done, total, label) => setProgress({ done, total, label }),
        true,
      );
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setMigrating(false);
      setProgress(null);
    }
  }, [migrating]);

  const handleSkip = useCallback(() => {
    MMKVStorage.set(SETUP_STORAGE_DISMISSED, '1');
    onDone();
  }, [onDone]);

  return (
    <SafeAreaView>
      <ScrollView contentContainerStyle={styles.content}>
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('setupStorage.title')}
          </List.SubHeader>
          <List.InfoItem title={getString('setupStorage.desc')} theme={theme} />
          <List.Item
            title={getString('setupStorage.chooseFolder')}
            onPress={handleChooseFolder}
            theme={theme}
          />
          {hasLegacyFiles && (
            <List.Item
              title={getString('setupStorage.migrateFiles')}
              onPress={handleMigrateFiles}
              disabled={migrating}
              theme={theme}
            />
          )}
          {progress !== null && (
            <View style={styles.progress}>
              <Text style={{ color: theme.onSurfaceVariant }}>
                {getString('setupStorage.migratingProgress', progress)}
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
        <Button mode="text" onPress={handleSkip} style={styles.skip}>
          {getString('setupStorage.skip')}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SetupStorageScreen;

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  progress: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressLabel: {
    fontSize: 12,
  },
  skip: {
    marginTop: 'auto',
  },
});
