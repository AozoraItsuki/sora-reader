import { Button } from '@components';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Dialog, overlay, Portal } from 'react-native-paper';

interface ClearProgressDialogProps {
  dialogVisible: boolean;
  hideDialog: () => void;
  theme: ThemeColors;
  /** Set for the per-item variant so the novel can be named in the copy. */
  novelName?: string;
  onSubmit: () => void;
}

/**
 * Destructive confirmation for removing reading progress, mirroring
 * `RemoveDownloadsDialog`. With `novelName` it confirms a single entry; without
 * it, the clear-everything case.
 */
const ClearProgressDialog = ({
  dialogVisible,
  hideDialog,
  theme,
  novelName,
  onSubmit,
}: ClearProgressDialogProps) => (
  <Portal>
    <Dialog
      visible={dialogVisible}
      onDismiss={hideDialog}
      style={[
        {
          backgroundColor: overlay(2, theme.surface),
        },
        styles.borderRadius,
      ]}
    >
      <Dialog.Title
        style={[
          {
            color: theme.onSurface,
          },
          styles.fontSize,
        ]}
      >
        {getString(
          novelName
            ? 'progressScreen.deleteConfirmTitle'
            : 'progressScreen.clearAllConfirmTitle',
        )}
      </Dialog.Title>
      <Dialog.Content>
        <Text style={[styles.content, { color: theme.onSurfaceVariant }]}>
          {getString(
            novelName
              ? 'progressScreen.deleteConfirmMessage'
              : 'progressScreen.clearAllConfirmMessage',
            novelName ? { name: novelName } : undefined,
          )}
        </Text>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={hideDialog}>{getString('common.cancel')}</Button>
        <Button onPress={onSubmit}>{getString('common.ok')}</Button>
      </Dialog.Actions>
    </Dialog>
  </Portal>
);

export default ClearProgressDialog;

const styles = StyleSheet.create({
  fontSize: {
    letterSpacing: 0,
    fontSize: 16,
  },
  content: {
    fontSize: 14,
  },
  borderRadius: { borderRadius: 6 },
});