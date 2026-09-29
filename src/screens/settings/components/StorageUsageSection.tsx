import { List } from '@components';
import { useTheme } from '@hooks/persisted';
import NativeFile from '@specs/NativeFile';
import { getString } from '@strings/translations';
import { OrphanEntry, scanOrphanDownloads } from '@utils/orphanDownloads';
import { showToast } from '@utils/showToast';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

export default function StorageUsageSection() {
  const theme = useTheme();
  const constants = NativeFile.getConstants();

  const [cacheSize, setCacheSize] = useState<number>(0);
  const [freeSpace, setFreeSpace] = useState<number>(constants.FreeSpace);
  const [orphans, setOrphans] = useState<readonly OrphanEntry[]>([]);

  const interactionTaskRef = useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingFetchStorageInfo = () => {
    if (interactionTaskRef.current) {
      interactionTaskRef.current.cancel();
      interactionTaskRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const fetchStorageInfo = useCallback(() => {
    cancelPendingFetchStorageInfo();
    interactionTaskRef.current = InteractionManager.runAfterInteractions(() => {
      timeoutRef.current = setTimeout(() => {
        try {
          let cache = NativeFile.getFileSize(
            constants.ExternalCachesDirectoryPath,
          );
          if (constants.CachesDirectoryPath) {
            cache += NativeFile.getFileSize(constants.CachesDirectoryPath);
          }
          setCacheSize(cache);

          const free = NativeFile.getFreeSpace();
          if (free > 0) {
            setFreeSpace(free);
          }

          setOrphans(scanOrphanDownloads());
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        } finally {
          timeoutRef.current = null;
          interactionTaskRef.current = null;
        }
      }, 100);
    });
  }, [constants.ExternalCachesDirectoryPath, constants.CachesDirectoryPath]);

  useEffect(() => {
    fetchStorageInfo();
    return () => {
      cancelPendingFetchStorageInfo();
    };
  }, [fetchStorageInfo]);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) {
      return '0 B';
    }
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const orphanBytes = orphans.reduce((total, o) => total + o.bytes, 0);

  const handleCleanOrphans = () => {
    if (orphans.length === 0) {
      return;
    }
    Alert.alert(
      getString('advancedSettingsScreen.cleanOrphansConfirmTitle'),
      getString('advancedSettingsScreen.cleanOrphansConfirm', {
        count: orphans.length,
        size: formatBytes(orphanBytes, 2),
      }),
      [
        { text: getString('common.cancel'), style: 'cancel' },
        {
          text: getString('common.delete'),
          style: 'destructive',
          onPress: () => {
            try {
              for (const orphan of orphans) {
                NativeFile.unlink(orphan.path);
              }
              fetchStorageInfo();
              showToast(getString('advancedSettingsScreen.orphansCleared'));
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error(e);
            }
          },
        },
      ],
    );
  };

  const handleClearCache = () => {
    try {
      NativeFile.unlink(constants.ExternalCachesDirectoryPath);
      NativeFile.mkdir(constants.ExternalCachesDirectoryPath);
      if (constants.CachesDirectoryPath) {
        NativeFile.unlink(constants.CachesDirectoryPath);
        NativeFile.mkdir(constants.CachesDirectoryPath);
      }
      fetchStorageInfo();
      showToast(getString('advancedSettingsScreen.cacheCleared'));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  const usePercent =
    constants.TotalSpace > 0
      ? ((constants.TotalSpace - freeSpace) / constants.TotalSpace) * 100
      : 0;

  return (
    <View style={styles.container}>
      <List.SubHeader theme={theme}>
        {getString('advancedSettingsScreen.storageUsage')}
      </List.SubHeader>
      <View style={styles.storageInfoContainer}>
        <Text style={[styles.pathLabel, { color: theme.primary }]}>
          {constants.StoragePath}
        </Text>
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBarTrack,
              { backgroundColor: theme.surfaceVariant },
            ]}
          >
            <View
              style={[
                styles.progressBarFill,
                { width: `${usePercent}%`, backgroundColor: theme.primary },
              ]}
            />
          </View>
        </View>
        <Text style={[styles.storageText, { color: theme.onSurfaceVariant }]}>
          {getString('advancedSettingsScreen.storageAvailable', {
            available: formatBytes(freeSpace, 2),
            total: formatBytes(constants.TotalSpace, 2),
          })}
        </Text>
      </View>

      <List.Item
        title={getString('advancedSettingsScreen.cleanCache')}
        description={getString('advancedSettingsScreen.cacheUsed', {
          size: formatBytes(cacheSize, 2),
        })}
        onPress={handleClearCache}
        theme={theme}
      />
      <List.Item
        title={getString('advancedSettingsScreen.cleanOrphans')}
        description={
          orphans.length === 0
            ? getString('advancedSettingsScreen.noOrphans')
            : getString('advancedSettingsScreen.orphansFound', {
                count: orphans.length,
                size: formatBytes(orphanBytes, 2),
              })
        }
        onPress={handleCleanOrphans}
        disabled={orphans.length === 0}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  storageInfoContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pathLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressBarTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  storageText: {
    fontSize: 14,
  },
});
