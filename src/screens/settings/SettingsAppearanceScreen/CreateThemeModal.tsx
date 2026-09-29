import { Button, Modal } from '@components';
import { ThemePicker } from '@components/ThemePicker/ThemePicker';
import { useTheme } from '@hooks/persisted';
import { CustomThemeInput } from '@hooks/persisted/useCustomThemes';
import { getString } from '@strings/translations';
import {
  CUSTOM_THEME_ID_BASE,
  generateCustomTheme,
} from '@theme/utils/generateCustomTheme';
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

import { Row } from '../../../components/Common';
import { parseTermColor } from '../SettingsTermsScreen/termColor';
import TermColorField from '../SettingsTermsScreen/TermColorField';

const PRESET_COLORS = [
  '#4611a8',
  '#EF5350',
  '#EC407A',
  '#AB47BC',
  '#7E57C2',
  '#5C6BC0',
  '#42A5F5',
  '#26C6DA',
  '#26A69A',
  '#66BB6A',
  '#FFCA28',
  '#FFA726',
  '#FF7043',
  '#8D6E63',
  '#BDBDBD',
  '#000000',
];

const PRESET_BG_LIGHT = [
  '#ffffff',
  '#f5eeff',
  '#f0fff4',
  '#fff8f0',
  '#f0f4ff',
  '#fff0f5',
];
const PRESET_BG_DARK = [
  '#1c1b1f',
  '#1a1025',
  '#0d1117',
  '#1a1a2e',
  '#12191f',
  '#1f1012',
];

const DEFAULT_PRIMARY = '#4611a8';
const DEFAULT_DARK_BACKGROUND = '#1a1025';
const DEFAULT_LIGHT_BACKGROUND = '#ffffff';

type ColorError = 'empty' | 'invalid' | null;

type ColorVerdict =
  | { ok: true; value: string }
  | { ok: false; error: ColorError };

/** Normalize what the user typed, or report why it cannot be used. */
const readColor = (raw: string): ColorVerdict => {
  const parsed = parseTermColor(raw);
  return parsed.ok
    ? { ok: true, value: parsed.value }
    : { ok: false, error: parsed.error };
};

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSave: (input: CustomThemeInput) => void;
}

/**
 * Swatches are a shortcut, not the contract: a theme color is free text, so the
 * primary and the background both accept the same hex/RGB notation the reader
 * terms use. Whatever is typed is normalized through [parseTermColor] before it
 * reaches the theme generator, so an invalid entry can never be persisted.
 */
const CreateThemeModal: React.FC<Props> = ({ visible, onDismiss, onSave }) => {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [background, setBackground] = useState(DEFAULT_DARK_BACKGROUND);
  const [primaryInput, setPrimaryInput] = useState(DEFAULT_PRIMARY);
  const [backgroundInput, setBackgroundInput] = useState(
    DEFAULT_DARK_BACKGROUND,
  );
  const [primaryError, setPrimaryError] = useState<ColorError>(null);
  const [backgroundError, setBackgroundError] = useState<ColorError>(null);
  const [isDark, setIsDark] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);

  const previewTheme = generateCustomTheme(
    CUSTOM_THEME_ID_BASE,
    name || 'Preview',
    primary,
    background,
    isDark,
  );

  const colorErrorMessage = getString(
    'appearanceScreen.createTheme.colorInvalidError',
  );

  const handleSave = () => {
    if (!name.trim()) {
      setNameError('Nama tema tidak boleh kosong');
      return;
    }

    const nextPrimary = readColor(primaryInput);
    const nextBackground = readColor(backgroundInput);
    // A theme role always needs a color, so an emptied field is reported with
    // the same copy as a malformed one rather than the terms screen's
    // "or clear the field" hint, which does not apply here.
    setPrimaryError(nextPrimary.ok ? null : nextPrimary.error);
    setBackgroundError(nextBackground.ok ? null : nextBackground.error);
    if (!nextPrimary.ok || !nextBackground.ok) {
      return;
    }

    setPrimary(nextPrimary.value);
    setBackground(nextBackground.value);
    onSave({
      name: name.trim(),
      primary: nextPrimary.value,
      background: nextBackground.value,
      isDark,
    });
    setName('');
    setPrimary(DEFAULT_PRIMARY);
    setBackground(DEFAULT_DARK_BACKGROUND);
    setPrimaryInput(DEFAULT_PRIMARY);
    setBackgroundInput(DEFAULT_DARK_BACKGROUND);
    setPrimaryError(null);
    setBackgroundError(null);
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
            <Text
              style={[styles.previewLabel, { color: theme.onSurfaceVariant }]}
            >
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
                  const next = val
                    ? DEFAULT_DARK_BACKGROUND
                    : DEFAULT_LIGHT_BACKGROUND;
                  setBackground(next);
                  setBackgroundInput(next);
                  setBackgroundError(null);
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
          onChangeText={t => {
            setName(t);
            setNameError(null);
          }}
          mode="outlined"
          theme={{ colors: { ...theme } }}
          dense
          error={Boolean(nameError)}
          style={styles.input}
          testID="theme-name-input"
        />
        {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}

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
              onPress={() => {
                setPrimary(item);
                setPrimaryInput(item);
                setPrimaryError(null);
              }}
            />
          )}
          style={styles.colorGrid}
        />
        <TermColorField
          label={getString('appearanceScreen.createTheme.customPrimary')}
          errorMessage={colorErrorMessage}
          testID="theme-primary-color-input"
          value={primaryInput}
          error={primaryError}
          onChange={value => {
            setPrimaryInput(value);
            setPrimaryError(null);
          }}
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
                styles.colorDotOutlined,
                { backgroundColor: item, borderColor: theme.outline },
                background === item && styles.colorDotSelected,
                background === item && { borderColor: theme.primary },
              ]}
              onPress={() => {
                setBackground(item);
                setBackgroundInput(item);
                setBackgroundError(null);
              }}
            />
          )}
          style={styles.colorGrid}
        />
        <TermColorField
          label={getString('appearanceScreen.createTheme.customBackground')}
          errorMessage={colorErrorMessage}
          testID="theme-background-color-input"
          value={backgroundInput}
          error={backgroundError}
          onChange={value => {
            setBackgroundInput(value);
            setBackgroundError(null);
          }}
        />

        <Row style={styles.btnRow}>
          <Button title="Batal" onPress={handleDismiss} />
          <Button
            title="Simpan"
            onPress={handleSave}
            testID="theme-save-button"
          />
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
  colorDotOutlined: {
    borderWidth: 1,
  },
  btnRow: {
    justifyContent: 'flex-end',
    marginTop: 12,
  },
});
