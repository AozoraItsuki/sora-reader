import { Modal } from '@components';
import { RadioButton } from '@components/RadioButton/RadioButton';
import { useDownloadSettings } from '@hooks/persisted/useSettings';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Portal } from 'react-native-paper';

interface RetryDelayModalProps {
  retryDelaySeconds: number;
  modalVisible: boolean;
  hideModal: () => void;
  theme: ThemeColors;
}

const DELAY_OPTIONS = [15, 30, 60, 90, 120, 180, 300];

const RetryDelayModal: React.FC<RetryDelayModalProps> = ({
  theme,
  retryDelaySeconds,
  hideModal,
  modalVisible,
}) => {
  const { setDownloadSettings } = useDownloadSettings();

  return (
    <Portal>
      <Modal visible={modalVisible} onDismiss={hideModal}>
        <Text style={[styles.modalHeader, { color: theme.onSurface }]}>
          {getString('downloadSettingsScreen.retryDelay')}
        </Text>
        {DELAY_OPTIONS.map(seconds => (
          <RadioButton
            key={seconds}
            status={retryDelaySeconds === seconds}
            onPress={() => {
              setDownloadSettings({ retryDelaySeconds: seconds });
              hideModal();
            }}
            label={getString('downloadSettingsScreen.retryDelayOption', {
              seconds,
            })}
            theme={theme}
          />
        ))}
      </Modal>
    </Portal>
  );
};

export default RetryDelayModal;

const styles = StyleSheet.create({
  modalHeader: {
    fontSize: 24,
    marginBottom: 10,
    paddingHorizontal: 24,
  },
});
