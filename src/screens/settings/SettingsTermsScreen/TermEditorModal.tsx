import { Button, Modal, SwitchItem } from '@components';
import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import { ReaderTerm } from '@utils/readerTerms';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseTermColor } from './termColor';
import TermColorField from './TermColorField';
import { replacementTextStyle } from './termStyle';
import TermStyleEditor, { TermDraft } from './TermStyleEditor';

const MAX_LEN = 128;

const EMPTY_DRAFT: TermDraft = {
  from: '',
  to: '',
  caseSensitive: false,
  style: undefined,
};

interface Props {
  visible: boolean;
  /** Term being edited, or undefined when adding a new one. */
  term: ReaderTerm | undefined;
  scopeLabel: string;
  onDismiss: () => void;
  onSave: (draft: TermDraft) => void;
}

/**
 * Add/edit form for a single term. The color field is free text because the user
 * may type either notation; the draft only receives a normalized `#rrggbb` so
 * an invalid entry can never reach storage.
 */
const TermEditorModal: React.FC<Props> = ({
  visible,
  term,
  scopeLabel,
  onDismiss,
  onSave,
}) => {
  const theme = useTheme();
  const [draft, setDraft] = useState<TermDraft>(EMPTY_DRAFT);
  const [colorInput, setColorInput] = useState('');
  const [colorError, setColorError] = useState<'empty' | 'invalid' | null>(
    null,
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraft(
      term
        ? {
            from: term.from,
            to: term.to,
            caseSensitive: term.caseSensitive,
            style: term.style,
          }
        : EMPTY_DRAFT,
    );
    setColorInput(term?.style?.color ?? '');
    setColorError(null);
  }, [visible, term]);

  const handleColorInput = (value: string) => {
    setColorInput(value);
    setColorError(null);
  };

  const handlePickColor = (color: string) => {
    setColorInput(color);
    setColorError(null);
    setDraft(current => ({
      ...current,
      style: { ...current.style, color },
    }));
  };

  const handleSave = () => {
    if (!colorInput.trim()) {
      onSave(draft);
      return;
    }
    const parsed = parseTermColor(colorInput);
    if (!parsed.ok) {
      setColorError(parsed.error);
      return;
    }
    onSave({
      ...draft,
      style: { ...draft.style, color: parsed.value },
    });
  };

  const canSave = draft.from.trim().length > 0;

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={{ backgroundColor: theme.surface }}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.onSurface }]}>
          {term
            ? getString('termsSettingsScreen.editTerm')
            : getString('termsSettingsScreen.addTerm')}
        </Text>

        <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
          {getString('termsSettingsScreen.scope')}: {scopeLabel}
        </Text>

        <Text style={[styles.label, { color: theme.onSurface }]}>
          {getString('termsSettingsScreen.fromLabel')}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.onSurface,
              borderColor: theme.outline,
              backgroundColor: theme.surfaceVariant,
            },
          ]}
          value={draft.from}
          onChangeText={value =>
            setDraft(current => ({
              ...current,
              from: value.slice(0, MAX_LEN),
            }))
          }
          placeholder={getString('termsSettingsScreen.fromPlaceholder')}
          placeholderTextColor={theme.onSurfaceVariant}
          autoCapitalize="none"
          autoCorrect={false}
          testID="term-from-input"
        />
        <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
          {getString('termsSettingsScreen.fromHint')}
        </Text>

        <Text style={[styles.label, { color: theme.onSurface }]}>
          {getString('termsSettingsScreen.toLabel')}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.onSurface,
              borderColor: theme.outline,
              backgroundColor: theme.surfaceVariant,
            },
          ]}
          value={draft.to}
          onChangeText={value =>
            setDraft(current => ({
              ...current,
              to: value.slice(0, MAX_LEN),
            }))
          }
          placeholder={getString('termsSettingsScreen.toPlaceholder')}
          placeholderTextColor={theme.onSurfaceVariant}
          autoCapitalize="none"
          autoCorrect={false}
          testID="term-to-input"
        />

        <SwitchItem
          label={getString('termsSettingsScreen.caseSensitive')}
          value={draft.caseSensitive}
          onPress={() =>
            setDraft(current => ({
              ...current,
              caseSensitive: !current.caseSensitive,
            }))
          }
          theme={theme}
        />

        <TermStyleEditor
          draft={draft}
          onChange={setDraft}
          onPickColor={handlePickColor}
        />

        <TermColorField
          value={colorInput}
          error={colorError}
          onChange={handleColorInput}
        />

        {draft.to.trim() !== '' && (
          <View
            style={[styles.preview, { backgroundColor: theme.surfaceVariant }]}
          >
            <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
              {getString('termsSettingsScreen.preview')}
            </Text>
            <Text
              style={replacementTextStyle(
                draft.style,
                theme.onSurface,
                styles.previewText.fontSize,
              )}
            >
              {draft.to}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title={getString('common.cancel')}
            onPress={onDismiss}
            style={styles.action}
          />
          <Button
            title={getString('common.save')}
            mode="contained"
            onPress={handleSave}
            disabled={!canSave}
            style={styles.action}
            testID="term-save-button"
          />
        </View>
      </ScrollView>
    </Modal>
  );
};

export default TermEditorModal;

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  hint: { fontSize: 12, marginTop: 4 },
  preview: { borderRadius: 8, padding: 10, marginTop: 12, gap: 4 },
  previewText: { fontSize: 15 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  action: { flex: 1 },
});
