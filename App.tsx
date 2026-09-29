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
import SetupStorageScreen from '@screens/setup/SetupStorageScreen';
import { ensureDirectStorage } from '@services/saf/directStorage';
import { runSafMigration } from '@services/saf/migrateToSaf';
import { isDirectStorageReady } from '@services/saf/safFile';
import { ensureSharedDirs } from '@services/saf/sharedDirs';
import ServiceManager from '@services/ServiceManager';
import { getString } from '@strings/translations';
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
 * Forced access gate (Mihon-style): nothing can be downloaded until all-files
 * access is granted, so the setup screen owns the first frame whenever the
 * grant is missing. Async on purpose: the cached readiness flag resets every
 * process start, so the gate probes the OS once and renders blank meanwhile —
 * a synchronous read here would flash setup on every cold start.
 */
const AppContent = () => {
  const { isLocked, isCredentialsRevoked, authenticate, dismissRevoked } =
    useAppLock();
  useScreenProtection();
  useCancelStuckBackupTasks();

  const [showStorageSetup, setShowStorageSetup] = useState<boolean | null>(
    null,
  );
  // The probe is one synchronous native call; until it settles the gate is
  // unknown and the first frame stays blank rather than flashing setup.
  useEffect(() => {
    void ensureDirectStorage().then(granted => setShowStorageSetup(!granted));
  }, []);
  const recheckStorageSetup = useCallback(() => {
    void ensureDirectStorage().then(granted => setShowStorageSetup(!granted));
  }, []);

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
      {showStorageSetup === null ? null : showStorageSetup ? (
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
        // The direct backend never creates the download roots itself and
        // `mkdir` on a deep path is a no-op while an ancestor is missing, so a
        // fresh install would fail every download. Best effort, no prompt.
        if (isDirectStorageReady()) {
          ensureSharedDirs();
        }
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
