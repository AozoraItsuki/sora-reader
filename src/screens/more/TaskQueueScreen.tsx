import { Appbar, EmptyView, Menu, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import { TaskQueueScreenProps } from '@navigators/types';
import ServiceManager, { QueuedBackgroundTask } from '@services/ServiceManager';
import { getString } from '@strings/translations';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMMKVObject } from 'react-native-mmkv';
import {
  Appbar as MaterialAppbar,
  FAB,
  overlay,
  ProgressBar,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { showToast } from '../../utils/showToast';

const DownloadQueue = ({ navigation }: TaskQueueScreenProps) => {
  const theme = useTheme();
  const { bottom, right } = useSafeAreaInsets();
  const [taskQueue] = useMMKVObject<QueuedBackgroundTask[]>(
    ServiceManager.manager.STORE_KEY,
  );

  // Filter out download tasks - downloads belong to Downloads -> Queue tab
  const nonDownloadTasks = useMemo(
    () =>
      (taskQueue || []).filter(item => item.task?.name !== 'DOWNLOAD_CHAPTER'),
    [taskQueue],
  );

  const [isRunning, setIsRunning] = useState(ServiceManager.manager.isRunning);
  const [visible, setVisible] = useState(false);
  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);

  useEffect(() => {
    if (nonDownloadTasks.length === 0) {
      setIsRunning(false);
    }
  }, [nonDownloadTasks]);

  const cancelNonDownloadTasks = () => {
    const list = ServiceManager.manager.getTaskList();
    for (const item of list) {
      if (item.task?.name !== 'DOWNLOAD_CHAPTER') {
        ServiceManager.manager.removeTaskById(item.id);
      }
    }
    setIsRunning(false);
    showToast(getString('common.cancel'));
    closeMenu();
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={'Task Queue'}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        <Menu
          visible={visible}
          onDismiss={closeMenu}
          anchor={
            nonDownloadTasks.length ? (
              <MaterialAppbar.Action
                icon="dots-vertical"
                iconColor={theme.onSurface}
                onPress={openMenu}
              />
            ) : null
          }
          contentStyle={{ backgroundColor: overlay(2, theme.surface) }}
        >
          <Menu.Item
            onPress={cancelNonDownloadTasks}
            title={getString('common.cancel')}
            titleStyle={{ color: theme.onSurface }}
          />
        </Menu>
      </Appbar>

      <FlatList
        contentContainerStyle={styles.paddingBottom}
        keyExtractor={(item, index) => 'task_' + index}
        data={nonDownloadTasks}
        renderItem={({ item }) => (
          <View
            style={[
              styles.taskCard,
              {
                backgroundColor: theme.surface2 || theme.surface,
                borderColor: theme.outlineVariant || theme.outline,
              },
            ]}
          >
            <View style={styles.taskInfo}>
              <Text style={[styles.taskTitle, { color: theme.onSurface }]}>
                {item.meta.name}
              </Text>
              {item.meta.progressText ? (
                <Text
                  style={[
                    styles.taskSubtitle,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  {item.meta.progressText}
                </Text>
              ) : null}
              <ProgressBar
                indeterminate={
                  item.meta.isRunning && item.meta.progress === undefined
                }
                progress={item.meta.progress}
                color={theme.primary}
                style={[
                  styles.progressBar,
                  { backgroundColor: theme.surfaceVariant },
                ]}
              />
            </View>
            <Pressable
              style={styles.cancelButton}
              onPress={() => ServiceManager.manager.removeTaskById(item.id)}
              android_ripple={{
                color: theme.rippleColor,
                borderless: true,
                radius: 20,
              }}
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={theme.onSurfaceVariant}
              />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <EmptyView
            iconName="playlist-check"
            description={'No background tasks'}
            theme={theme}
          />
        }
      />
      {nonDownloadTasks.length > 0 ? (
        <FAB
          style={[
            styles.fab,
            { backgroundColor: theme.primary, bottom, right },
          ]}
          color={theme.onPrimary}
          label={
            isRunning ? getString('common.pause') : getString('common.resume')
          }
          uppercase={false}
          icon={isRunning ? 'pause' : 'play'}
          onPress={() => {
            if (isRunning) {
              ServiceManager.manager.pause();
              setIsRunning(false);
            } else {
              ServiceManager.manager.resume();
              setIsRunning(true);
            }
          }}
        />
      ) : null}
    </SafeAreaView>
  );
};

export default DownloadQueue;

const styles = StyleSheet.create({
  fab: {
    bottom: 16,
    margin: 16,
    position: 'absolute',
    right: 0,
  },
  paddingBottom: { padding: 12, paddingBottom: 100, flexGrow: 1 },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  taskInfo: {
    flex: 1,
    marginRight: 8,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  taskSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  progressBar: {
    marginTop: 10,
    borderRadius: 4,
    height: 4,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
