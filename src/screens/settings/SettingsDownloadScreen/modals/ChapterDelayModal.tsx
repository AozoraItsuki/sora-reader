import { Modal } from '@components';
import { RadioButton } from '@components/RadioButton/RadioButton';
import { useDownloadSettings } from '@hooks/persisted/useSettings';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Portal } from 'react-native-paper';

interface ChapterDelayModalProps {
  chapterDelaySeconds: number;
  modalVisible: boolean;
  hideModal: () => void;
  theme: ThemeColors;
}

const DELAY_OPTIONS = [0, 5, 10, 15, 30, 60, 120];

const ChapterDelayModal: React.FC<ChapterDelayModalProps> = ({
  theme,
  chapterDelaySeconds,
  hideModal,
  modalVisible,
}) => {
  const { setDownloadSettings } = useDownloadSettings();

  return (
    <Portal>
      <Modal visible={modalVisible} onDismiss={hideModal}>
        <Text style={[styles.modalHeader, { color: theme.onSurface }]}>
          {getString('downloadSettingsScreen.chapterDelay')}
        </Text>
        {DELAY_OPTIONS.map(seconds => (
          <RadioButton
            key={seconds}
            status={chapterDelaySeconds === seconds}
            onPress={() => {
              setDownloadSettings({ chapterDelaySeconds: seconds });
              hideModal();
            }}
            label={
              seconds === 0
                ? getString('downloadSettingsScreen.chapterDelayNone')
                : getString('downloadSettingsScreen.chapterDelayOption', {
                    seconds,
                  })
            }
            theme={theme}
          />
        ))}
      </Modal>
    </Portal>
  );
};

export default ChapterDelayModal;

const styles = StyleSheet.create({
  modalHeader: {
    fontSize: 24,
    marginBottom: 10,
    paddingHorizontal: 24,
  },
});
