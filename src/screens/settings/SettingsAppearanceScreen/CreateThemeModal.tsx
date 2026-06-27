import { Button, Modal } from '@components';
import { Row } from '../../../components/Common';
import { useTheme } from '@hooks/persisted';
import { CustomThemeInput } from '@hooks/persisted/useCustomThemes';
import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Portal, TextInput } from 'react-native-paper';
import { ThemePicker } from '@components/ThemePicker/ThemePicker';
import { generateCustomTheme, CUSTOM_THEME_ID_BASE } from '@theme/utils/generateCustomTheme';

const PRESET_COLORS = [
  '#4611a8', '#EF5350', '#EC407A', '#AB47BC',
  '#7E57C2', '#5C6BC0', '#42A5F5', '#26C6DA',
  '#26A69A', '#66BB6A', '#FFCA28', '#FFA726',
  '#FF7043', '#8D6E63', '#BDBDBD', '#000000',
];

const PRESET_BG_LIGHT = ['#ffffff', '#f5eeff', '#f0fff4', '#fff8f0', '#f0f4ff', '#fff0f5'];
const PRESET_BG_DARK = ['#1c1b1f', '#1a1025', '#0d1117', '#1a1a2e', '#12191f', '#1f1012'];

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSave: (input: CustomThemeInput) => void;
}

const CreateThemeModal: React.FC<Props> = ({ visible, onDismiss, onSave }) => {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState('#4611a8');
  const [background, setBackground] = useState('#1a1025');
  const [isDark, setIsDark] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);

  const previewTheme = generateCustomTheme(CUSTOM_THEME_ID_BASE, name || 'Preview', primary, background, isDark);

  const handleSave = () => {
    if (!name.trim()) {
      setNameError('Nama tema tidak boleh kosong');
      return;
    }
    onSave({ name: name.trim(), primary, background, isDark });
    setName('');
    setPrimary('#4611a8');
    setBackground('#1a1025');
    setIsDark(true);
    setNameError(null);
    onDismiss();
  };

  const handleDismiss = () => {
    setName('');
    setNameError(null);
    onDismiss();
  };

  const bgPresets = isDark ? PRESET_BG_DARK : PRESET_BG_LIGHT;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={handleDismiss}>
        <Text style={[styles.title, { color: theme.onSurface }]}>
          Buat Tema Baru
        </Text>

        {/* Preview */}
        <View style={styles.previewRow}>
          <ThemePicker
            theme={previewTheme}
            currentTheme={{ ...previewTheme, id: -1 }}
            onPress={() => {}}
          />
          <View style={styles.previewInfo}>
            <Text style={[styles.previewLabel, { color: theme.onSurfaceVariant }]}>
              Preview tema
            </Text>
            <View style={styles.darkToggleRow}>
              <Text style={[styles.toggleLabel, { color: theme.onSurface }]}>
                Mode Gelap
              </Text>
              <Switch
                value={isDark}
                onValueChange={val => {
                  setIsDark(val);
                  setBackground(val ? '#1a1025' : '#ffffff');
                }}
                trackColor={{ true: theme.primary, false: theme.outline }}
                thumbColor={isDark ? theme.onPrimary : theme.surfaceVariant}
              />
            </View>
          </View>
        </View>

        {/* Name */}
        <TextInput
          label="Nama Tema"
          value={name}
          onChangeText={t => { setName(t); setNameError(null); }}
          mode="outlined"
          theme={{ colors: { ...theme } }}
          dense
          error={Boolean(nameError)}
          style={styles.input}
        />
        {nameError ? (
          <Text style={styles.errorText}>{nameError}</Text>
        ) : null}

        {/* Primary Color */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
          Warna Utama (Primary)
        </Text>
        <FlatList
          data={PRESET_COLORS}
          numColumns={8}
          keyExtractor={item => item}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.colorDot,
                { backgroundColor: item },
                primary === item && styles.colorDotSelected,
                primary === item && { borderColor: theme.primary },
              ]}
              onPress={() => setPrimary(item)}
            />
          )}
          style={styles.colorGrid}
        />

        {/* Background Color */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
          Warna Latar
        </Text>
        <FlatList
          data={bgPresets}
          numColumns={6}
          keyExtractor={item => item}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.colorDot,
                { backgroundColor: item, borderWidth: 1, borderColor: theme.outline },
                background === item && styles.colorDotSelected,
                background === item && { borderColor: theme.primary },
              ]}
              onPress={() => setBackground(item)}
            />
          )}
          style={styles.colorGrid}
        />

        <Row style={styles.btnRow}>
          <Button title="Batal" onPress={handleDismiss} />
          <Button title="Simpan" onPress={handleSave} />
        </Row>
      </Modal>
    </Portal>
  );
};

export default CreateThemeModal;

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 16,
  },
  previewInfo: {
    flex: 1,
    gap: 8,
  },
  previewLabel: {
    fontSize: 12,
  },
  darkToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 14,
  },
  input: {
    marginBottom: 4,
  },
  errorText: {
    color: '#FF0033',
    fontSize: 12,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  colorGrid: {
    marginBottom: 4,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    margin: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderWidth: 3,
  },
  btnRow: {
    justifyContent: 'flex-end',
    marginTop: 12,
  },
});
