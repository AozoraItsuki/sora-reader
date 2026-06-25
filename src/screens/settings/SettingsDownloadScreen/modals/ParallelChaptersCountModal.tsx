import { Modal } from '@components';
import { RadioButton } from '@components/RadioButton/RadioButton';
import { useDownloadSettings } from '@hooks/persisted/useSettings';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Portal } from 'react-native-paper';

interface ParallelChaptersCountModalProps {
  parallelChaptersCount: number;
  modalVisible: boolean;
  hideModal: () => void;
  theme: ThemeColors;
}

const ParallelChaptersCountModal: React.FC<ParallelChaptersCountModalProps> = ({
  theme,
  parallelChaptersCount,
  hideModal,
  modalVisible,
}) => {
  const { setDownloadSettings } = useDownloadSettings();

  return (
    <Portal>
      <Modal visible={modalVisible} onDismiss={hideModal}>
        <Text style={[styles.modalHeader, { color: theme.onSurface }]}>
          {getString('downloadSettingsScreen.parallelChaptersCount')}
        </Text>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(count => (
          <RadioButton
            key={count}
            status={parallelChaptersCount === count}
            onPress={() => {
              setDownloadSettings({ parallelChaptersCount: count });
              hideModal();
            }}
            label={count.toString()}
            theme={theme}
          />
        ))}
      </Modal>
    </Portal>
  );
};

export default ParallelChaptersCountModal;

const styles = StyleSheet.create({
  modalHeader: {
    fontSize: 24,
    marginBottom: 10,
    paddingHorizontal: 24,
  },
});
