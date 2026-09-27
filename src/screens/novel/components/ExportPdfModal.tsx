import { Button, List, Modal, SwitchItem } from '@components';
import { useBoolean } from '@hooks';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import { showToast } from '@utils/showToast';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Text, TextInput } from 'react-native-paper';

interface ExportPdfModalProps {
  isVisible: boolean;
  onSubmit?: (startChapter?: number, endChapter?: number) => void;
  hideModal: () => void;
}

/**
 * Options for the PDF export. The destination is not chosen here: the system
 * save dialog asks for it once the document has been rendered.
 */
const ExportPdfModal: React.FC<ExportPdfModalProps> = ({
  isVisible,
  onSubmit: onSubmitProp,
  hideModal,
}) => {
  const theme = useTheme();
  const {
    epubUseAppTheme = false,
    epubUseCustomCSS = false,
    setChapterReaderSettings,
  } = useChapterReaderSettings();

  const useAppTheme = useBoolean(epubUseAppTheme);
  const useCustomCSS = useBoolean(epubUseCustomCSS);
  const exportAll = useBoolean(true);
  const [startChapter, setStartChapter] = useState('');
  const [endChapter, setEndChapter] = useState('');

  const onDismiss = () => {
    hideModal();
    exportAll.setTrue();
    setStartChapter('');
    setEndChapter('');
  };

  const onSubmit = () => {
    let start: number | undefined;
    let end: number | undefined;

    if (!exportAll.value) {
      start = parseInt(startChapter, 10);
      end = parseInt(endChapter, 10);

      if (isNaN(start) || isNaN(end) || start < 1 || end < 1) {
        showToast(getString('novelScreen.exportEpubModal.invalidRange'));
        return;
      }

      if (start > end) {
        showToast(getString('novelScreen.exportEpubModal.startGreaterThanEnd'));
        return;
      }
    }

    setChapterReaderSettings({
      epubUseAppTheme: useAppTheme.value,
      epubUseCustomCSS: useCustomCSS.value,
    });

    onSubmitProp?.(start, end);
    hideModal();
  };

  return (
    <Modal visible={isVisible} onDismiss={onDismiss}>
      <KeyboardAwareScrollView key={isVisible ? 'visible' : 'hidden'}>
        <View>
          <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
            {getString('novelScreen.exportPdfModal.title')}
          </Text>
        </View>
        <View style={styles.settings}>
          <SwitchItem
            label={getString('novelScreen.exportPdfModal.exportAll')}
            value={exportAll.value}
            onPress={exportAll.toggle}
            theme={theme}
          />
          {!exportAll.value && (
            <View style={styles.rangeInputs}>
              <TextInput
                label={getString('novelScreen.exportEpubModal.startChapter')}
                defaultValue={startChapter}
                onChangeText={setStartChapter}
                keyboardType="numeric"
                mode="outlined"
                theme={{ colors: { ...theme } }}
                underlineColor={theme.outline}
                dense
                style={styles.rangeInput}
              />
              <TextInput
                label={getString('novelScreen.exportEpubModal.endChapter')}
                defaultValue={endChapter}
                onChangeText={setEndChapter}
                keyboardType="numeric"
                mode="outlined"
                theme={{ colors: { ...theme } }}
                underlineColor={theme.outline}
                dense
                style={styles.rangeInput}
              />
            </View>
          )}
          <SwitchItem
            label={getString('novelScreen.exportPdfModal.applyReaderTheme')}
            value={useAppTheme.value}
            onPress={useAppTheme.toggle}
            theme={theme}
          />
          <SwitchItem
            label={getString('novelScreen.exportPdfModal.includeCustomCSS')}
            value={useCustomCSS.value}
            onPress={useCustomCSS.toggle}
            theme={theme}
          />
        </View>
        <List.InfoItem
          style={styles.infoItem}
          title={getString('novelScreen.exportPdfModal.downloadedChaptersOnly')}
          theme={theme}
        />
        <View style={styles.modalFooterCtn}>
          <Button title={getString('common.submit')} onPress={onSubmit} />
          <Button title={getString('common.cancel')} onPress={hideModal} />
        </View>
      </KeyboardAwareScrollView>
    </Modal>
  );
};

export default ExportPdfModal;

const styles = StyleSheet.create({
  infoItem: {
    paddingHorizontal: 0,
  },

  modalFooterCtn: {
    flexDirection: 'row-reverse',

    paddingBottom: 20,
    paddingTop: 8,
  },
  modalTitle: {
    fontSize: 24,
    marginBottom: 16,
  },
  settings: {
    marginTop: 12,
  },
  rangeInputs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  rangeInput: {
    flex: 1,
  },
});
