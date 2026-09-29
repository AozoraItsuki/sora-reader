import { Button, List, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import {
  hasLegacyDownloads,
  runSafMigration,
} from '@services/saf/migrateToSaf';
import {
  ensureDirectStorage,
  isDirectStorageReady,
  SAF_TREE_ROOT,
  safMkdir,
} from '@services/saf/safFile';
import { syncSafTreeUriToServer } from '@services/saf/useSafLocation';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProgressBar } from 'react-native-paper';

/** Set to '1' once all-files access was granted or the user skipped setup. */
export const SETUP_STORAGE_DISMISSED = 'SETUP_STORAGE_DISMISSED';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** How far the migration has got: files moved, files to move, current one. */
type MigrationProgress = { done: number; total: number; label: string };

interface SetupStorageScreenProps {
  /** Called once access is granted or the user skipped setup. */
  onDone: () => void;
}

/**
 * First-run storage setup: downloads live in a plain `/SoraReader` folder on
 * shared storage, which Android only allows with all-files access. So this is a
 * grant screen, not a folder picker — it blocks the library until the user
 * grants it (or says they do not want to right now).
 */
const SetupStorageScreen = ({ onDone }: SetupStorageScreenProps) => {
  const theme = useTheme();

  // A native directory listing on every render would be wasteful, and the
  // legacy folder cannot grow while this screen is up.
  const [hasLegacyFiles] = useState(hasLegacyDownloads);
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);

  /**
   * Re-read the permission and, once it is really granted, finish setup. This is
   * the only place that decides the screen is done, so the automatic and the
   * manual path cannot disagree.
   */
  const finishIfGranted = useCallback(async (): Promise<boolean> => {
    try {
      if (!(await ensureDirectStorage())) {
        return false;
      }
      // Make sure the root the server walks into exists before it is told to
      // serve from it, then move whatever is still in the old app-private
      // location into the new one.
      await safMkdir(SAF_TREE_ROOT);
      syncSafTreeUriToServer();
      onDone();
      return true;
    } catch (error) {
      showToast(errorMessage(error));
      return false;
    }
  }, [onDone]);

  const handleGrantAccess = useCallback(() => {
    // The grant screen is a separate activity, so probing here would always
    // answer "no": the user has not had a chance to flip the switch yet. The
    // AppState listener below re-checks once they come back.
    try {
      NativeFile.openAllFilesAccessSettings();
    } catch (error) {
      showToast(errorMessage(error));
    }
  }, []);

  // Returning from the grant screen is the one moment the permission can have
  // changed, so the screen finishes itself instead of trapping the user on a
  // dead button. The subscription is dropped on unmount so a late event cannot
  // call into a screen that is gone.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void finishIfGranted();
      }
    });
    return () => subscription.remove();
  }, [finishIfGranted]);

  const handleContinue = useCallback(async () => {
    if (!(await finishIfGranted())) {
      showToast(getString('setupStorage.accessMissing'));
    }
  }, [finishIfGranted]);

  const handleMigrateFiles = useCallback(async () => {
    if (migrating) {
      return;
    }
    setMigrating(true);
    try {
      // Granting already migrates on a fresh install; this retries a run that
      // could not finish, which deliberately leaves the legacy tree in place. It
      // forces the run so a migration already marked done can be re-run by hand.
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
            title={getString('setupStorage.grantAccess')}
            description={getString('setupStorage.grantAccessDesc')}
            onPress={handleGrantAccess}
            theme={theme}
          />
          {!isDirectStorageReady() && (
            <List.InfoItem
              title={getString('setupStorage.accessMissing')}
              theme={theme}
            />
          )}
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
        <View style={styles.actions}>
          <Button mode="contained" onPress={handleContinue}>
            {getString('setupStorage.continue')}
          </Button>
          <Button mode="text" onPress={handleSkip}>
            {getString('setupStorage.skip')}
          </Button>
        </View>
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
  actions: {
    gap: 8,
    marginTop: 'auto',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
