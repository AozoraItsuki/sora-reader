import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

interface Props {
  value: string;
  error: 'empty' | 'invalid' | null;
  onChange: (value: string) => void;
}

/**
 * Free-text color field. The user may type either notation, so the value is
 * kept verbatim and the error carries the verdict until the term is saved.
 */
const TermColorField: React.FC<Props> = ({ value, error, onChange }) => {
  const theme = useTheme();

  return (
    <View>
      <Text style={[styles.label, { color: theme.onSurface }]}>
        {getString('termsSettingsScreen.customColor')}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            color: theme.onSurface,
            borderColor: error ? theme.error : theme.outline,
            backgroundColor: theme.surfaceVariant,
          },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={getString('termsSettingsScreen.customColorPlaceholder')}
        placeholderTextColor={theme.onSurfaceVariant}
        autoCapitalize="none"
        autoCorrect={false}
        testID="term-color-input"
      />
      {error && (
        <Text
          style={[styles.error, { color: theme.error }]}
          testID="term-color-error"
        >
          {getString(
            error === 'empty'
              ? 'termsSettingsScreen.colorEmptyError'
              : 'termsSettingsScreen.colorInvalidError',
          )}
        </Text>
      )}
    </View>
  );
};

export default TermColorField;

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { fontSize: 12, marginTop: 4 },
});
