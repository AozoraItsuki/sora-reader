import { Appbar, EmptyView, Menu, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import { TaskQueueScreenProps } from '@navigators/types';
import ServiceManager, { QueuedBackgroundTask } from '@services/ServiceManager';
import { getString } from '@strings/translations';
import React, { useEffect, useState } from 'react';
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
  const [isRunning, setIsRunning] = useState(ServiceManager.manager.isRunning);
  const [visible, setVisible] = useState(false);
  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);
  useEffect(() => {
    if (taskQueue?.length === 0) {
      setIsRunning(false);
    }
  }, [taskQueue]);

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
            taskQueue?.length ? (
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
            onPress={() => {
              ServiceManager.manager.stop();
              setIsRunning(false);
              showToast(getString('downloadScreen.cancelled'));
              closeMenu();
            }}
            title={getString('downloadScreen.cancelDownloads')}
            titleStyle={{ color: theme.onSurface }}
          />
        </Menu>
      </Appbar>

      <FlatList
        contentContainerStyle={styles.paddingBottom}
        keyExtractor={(item, index) => 'task_' + index}
        data={taskQueue || []}
        renderItem={({ item }) => (
          <View style={styles.taskRow}>
            <View style={styles.taskInfo}>
              <Text style={{ color: theme.onSurface }}>{item.meta.name}</Text>
              {item.meta.progressText ? (
                <Text style={{ color: theme.onSurfaceVariant }}>
                  {item.meta.progressText}
                </Text>
              ) : null}
              <ProgressBar
                indeterminate={
                  item.meta.isRunning && item.meta.progress === undefined
                }
                progress={item.meta.progress}
                color={theme.primary}
                style={[{ backgroundColor: theme.surface2 }, styles.marginTop]}
              />
            </View>
            <Pressable
              style={[styles.cancelButton]}
              onPress={() => ServiceManager.manager.removeTaskById(item.id)}
              android_ripple={{ color: theme.rippleColor, borderless: true, radius: 20 }}
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
            description={'No running tasks'}
            theme={theme}
          />
        }
      />
      {taskQueue && taskQueue.length > 0 ? (
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
  marginTop: { marginTop: 8 },
  paddingBottom: { paddingBottom: 100, flexGrow: 1 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingRight: 8,
  },
  taskInfo: {
    flex: 1,
    marginRight: 8,
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
