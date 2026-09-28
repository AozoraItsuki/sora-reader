import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import { TermStyle } from '@utils/readerTerms';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip } from 'react-native-paper';

export interface TermDraft {
  from: string;
  to: string;
  caseSensitive: boolean;
  style?: TermStyle;
}

const PRESET_COLORS = [
  '#ff5252',
  '#ff9800',
  '#ffeb3b',
  '#4caf50',
  '#2196f3',
  '#9c27b0',
  '#00bcd4',
];

const STYLE_FLAG_LABELS = {
  bold: 'termsSettingsScreen.bold',
  italic: 'termsSettingsScreen.italic',
  underline: 'termsSettingsScreen.underline',
} as const;

type StyleFlag = keyof typeof STYLE_FLAG_LABELS;

const FLAG_PREVIEW: Record<StyleFlag, object> = {
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
};

interface Props {
  draft: TermDraft;
  onChange: (draft: TermDraft) => void;
  onPickColor: (color: string) => void;
}

/**
 * Style controls for the replacement text. Flags toggle directly; the color is
 * chosen from swatches here, while its free-text input and validation live in
 * the term editor that owns the draft.
 */
const TermStyleEditor: React.FC<Props> = ({ draft, onChange, onPickColor }) => {
  const theme = useTheme();
  const current = draft.style;

  const setFlag = (flag: StyleFlag, value: boolean) => {
    onChange({
      ...draft,
      style: { ...current, [flag]: value || undefined },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.onSurface }]}>
        {getString('termsSettingsScreen.replacementStyle')}
      </Text>
      <View style={styles.row}>
        {(Object.keys(STYLE_FLAG_LABELS) as StyleFlag[]).map(flag => (
          <Chip
            key={flag}
            selected={Boolean(current?.[flag])}
            showSelectedCheck
            onPress={() => setFlag(flag, !current?.[flag])}
            style={styles.chip}
          >
            <Text style={[styles.chipText, FLAG_PREVIEW[flag]]}>
              {getString(STYLE_FLAG_LABELS[flag])}
            </Text>
          </Chip>
        ))}
      </View>

      <Text style={[styles.label, { color: theme.onSurface }]}>
        {getString('termsSettingsScreen.color')}
      </Text>
      <View style={styles.row}>
        {PRESET_COLORS.map(color => (
          <Chip
            key={color}
            selected={current?.color === color}
            showSelectedCheck
            onPress={() => onPickColor(color)}
            style={styles.chip}
          >
            <View style={[styles.swatch, { backgroundColor: color }]} />
          </Chip>
        ))}
      </View>
    </View>
  );
};

export default TermStyleEditor;

const styles = StyleSheet.create({
  container: { gap: 8, marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16 },
  chipText: { fontSize: 13 },
  swatch: { width: 20, height: 20, borderRadius: 10 },
});
