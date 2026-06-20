import { Modal, RadioButton } from '@components';
import { useTheme } from '@hooks/persisted';
import { getString, setLocale } from '@strings/translations';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useMMKVString } from 'react-native-mmkv';
import { Dialog, Portal } from 'react-native-paper';

interface LanguagePickerModalProps {
  visible: boolean;
  onDismiss: () => void;
}

interface LanguageOption {
  locale: string;
  nativeName: string;
  englishName: string;
}

const languages: LanguageOption[] = [
  { locale: '', nativeName: 'Default', englishName: 'Default' },
  { locale: 'en', nativeName: 'English', englishName: 'English' },
  { locale: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian' },
];

const LanguagePickerModal: React.FC<LanguagePickerModalProps> = ({
  onDismiss,
  visible,
}) => {
  const theme = useTheme();
  const [currentLocale = ''] = useMMKVString('APP_LOCALE');

  const handleLanguageSelect = (locale: string) => {
    setLocale(locale);
    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.maxHeight}
      >
        <Dialog.Title theme={{ colors: theme }} style={styles.zeroPadding}>
          {getString('appearanceScreen.appLanguage')}
        </Dialog.Title>
        <Text style={[styles.noteText, { color: theme.onSurfaceVariant }]}>
          {getString('appearanceScreen.languagePickerModal.restartNote')}
        </Text>
        <FlatList
          data={languages}
          keyExtractor={item => item.locale}
          renderItem={({ item }) => (
            <RadioButton
              key={item.locale}
              status={currentLocale === item.locale}
              onPress={() => handleLanguageSelect(item.locale)}
              label={item.nativeName}
              theme={theme}
              style={styles.zeroPadding}
            />
          )}
        />
      </Modal>
    </Portal>
  );
};

export default LanguagePickerModal;

const styles = StyleSheet.create({
  noteText: {
    lineHeight: 20,
    marginBottom: 8,
  },
  zeroPadding: { paddingHorizontal: 0, marginHorizontal: 0, marginTop: 0 },
  maxHeight: { maxHeight: '60%' },
});
