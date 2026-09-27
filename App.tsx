import { enableFreeze } from 'react-native-screens';

enableFreeze(true);

import AppErrorBoundary, {
  ErrorFallback,
  NativeCrashFallback,
} from '@components/AppErrorBoundary/AppErrorBoundary';
import { useInitDatabase } from '@database/db';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  useLibrarySettings,
  useSecuritySettings,
} from '@hooks/persisted/useSettings';
import { ThemeProvider } from '@hooks/persisted/useTheme';
import { CloudflareSolverOverlay } from '@plugins/helpers/CloudflareSolverOverlay';
import { initLocalServer } from '@plugins/local/localServerManager';
import AppLockOverlay, { useAppLock } from '@screens/more/AppLockScreen';
import SetupStorageScreen, {
  SETUP_STORAGE_DISMISSED,
} from '@screens/setup/SetupStorageScreen';
import { runSafMigration } from '@services/saf/migrateToSaf';
import { getSafTreeUri } from '@services/saf/safFile';
import ServiceManager from '@services/ServiceManager';
import { getString } from '@strings/translations';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { restoreNativeProxyFromStorage } from '@utils/nativeProxy';
import { showToast } from '@utils/showToast';
import * as Notifications from 'expo-notifications';
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { NativeModules, StatusBar, StyleSheet } from 'react-native';
import FileViewer from 'react-native-file-viewer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import LottieSplashScreen from 'react-native-lottie-splash-screen';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Main from './src/navigators/Main';

// Restore proxy settings into native OkHttp client as early as possible
restoreNativeProxyFromStorage();

Notifications.setNotificationHandler({
  handleNotification: async () => {
    return {
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

/**
 * Manages FLAG_SECURE for screen protection.
 */
const useScreenProtection = () => {
  const { screenProtection } = useSecuritySettings();
  const { incognitoMode } = useLibrarySettings();

  useEffect(() => {
    try {
      const { FlagSecure } = NativeModules;
      if (!FlagSecure) {
        return;
      }

      const shouldProtect =
        screenProtection === 'always' ||
        (screenProtection === 'incognito' && incognitoMode);

      if (shouldProtect) {
        FlagSecure.activate();
      } else {
        FlagSecure.deactivate();
      }
    } catch {
      // Module not available
    }
  }, [screenProtection, incognitoMode]);
};

/**
 * Cancel stuck backup tasks from previous sessions
 */
const useCancelStuckBackupTasks = () => {
  useEffect(() => {
    const taskList = ServiceManager.manager.getTaskList();
    const backupTasks = [
      'LOCAL_BACKUP',
      'DRIVE_BACKUP',
      'SELF_HOST_BACKUP',
      'LOCAL_RESTORE',
      'DRIVE_RESTORE',
      'SELF_HOST_RESTORE',
    ];

    const hasStuckBackupTasks = taskList.some(
      t => t?.task?.name && backupTasks.includes(t.task.name),
    );

    if (hasStuckBackupTasks) {
      backupTasks.forEach(name =>
        ServiceManager.manager.removeTasksByName(name as any),
      );
      showToast(getString('backupLogScreen.incompleteBackupCancelled'));
    }
  }, []);
};

/**
 * Nothing can be downloaded until the user points the app at a folder, so setup
 * blocks the library on the first run — until a folder is picked, or until the
 * user explicitly skips it. Independent of the database: a failed init must
 * still leave the setup screen reachable.
 */
const needsStorageSetup = (): boolean =>
  getSafTreeUri() === null &&
  MMKVStorage.getString(SETUP_STORAGE_DISMISSED) !== '1';

const AppContent = () => {
  const { isLocked, isCredentialsRevoked, authenticate, dismissRevoked } =
    useAppLock();
  useScreenProtection();
  useCancelStuckBackupTasks();

  const [showStorageSetup, setShowStorageSetup] = useState(needsStorageSetup);
  // Setup persists the answer, so the gate has to be re-read once it reports
  // completion instead of waiting for the next mount.
  const recheckStorageSetup = useCallback(
    () => setShowStorageSetup(needsStorageSetup()),
    [],
  );

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      async response => {
        const { data } = response.notification.request.content;
        if (data?.action === 'open_update_error_log' && data?.filePath) {
          try {
            const cleanPath = (data.filePath as string).replace('file://', '');
            await FileViewer.open(cleanPath);
          } catch (e) {
            showToast(`Failed to open error log: ${(e as any).message}`);
          }
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <>
      {showStorageSetup ? (
        <SetupStorageScreen onDone={recheckStorageSetup} />
      ) : (
        <Main />
      )}
      <AppLockOverlay
        isLocked={isLocked}
        onAuthenticate={authenticate}
        isCredentialsRevoked={isCredentialsRevoked}
        onDismissRevoked={dismissRevoked}
      />
      <CloudflareSolverOverlay />
    </>
  );
};

const App = () => {
  const state = useInitDatabase();

  useEffect(() => {
    LottieSplashScreen.hide();
  }, []);

  useEffect(() => {
    if (state.success) {
      // The server has to know the download tree before the existing downloads
      // can be moved into it, so migration runs after the server is up.
      void (async () => {
        await initLocalServer();
        await runSafMigration();
      })();
    }
  }, [state.success]);

  return (
    <Suspense fallback={null}>
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <ThemeProvider>
              {state.error ? (
                <ErrorFallback error={state.error} resetError={() => null} />
              ) : (
                <NativeCrashFallback>
                  <AppErrorBoundary>
                    <PaperProvider>
                      <BottomSheetModalProvider>
                        <StatusBar
                          translucent={true}
                          backgroundColor="transparent"
                        />
                        <AppContent />
                      </BottomSheetModalProvider>
                    </PaperProvider>
                  </AppErrorBoundary>
                </NativeCrashFallback>
              )}
            </ThemeProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </Suspense>
  );
};

export default App;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
