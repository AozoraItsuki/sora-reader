import { List } from '@components';
import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import { ReaderTerm, TermStyle } from '@utils/readerTerms';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconButton, List as PaperList } from 'react-native-paper';

import { replacementTextStyle } from './termStyle';

interface TermRowProps {
  term: ReaderTerm;
  onEdit: () => void;
  onDelete: () => void;
  hasStyle: (style?: TermStyle) => boolean;
}

/** One term row: the matched text, the styled replacement, edit and delete. */
const TermRow: React.FC<TermRowProps> = ({
  term,
  onEdit,
  onDelete,
  hasStyle,
}) => {
  const theme = useTheme();

  return (
    <PaperList.Item
      title={term.from}
      description={term.to || getString('termsSettingsScreen.hiddenTerm')}
      titleStyle={{ color: theme.onSurface }}
      descriptionStyle={replacementTextStyle(
        term.style,
        theme.onSurfaceVariant,
      )}
      onPress={onEdit}
      // eslint-disable-next-line react/no-unstable-nested-components
      left={() => (
        <View style={styles.badges}>
          {term.caseSensitive && (
            <Text style={[styles.badge, { color: theme.primary }]}>Aa</Text>
          )}
          {hasStyle(term.style) && (
            <Text style={[styles.badge, { color: theme.primary }]}>*</Text>
          )}
        </View>
      )}
      // eslint-disable-next-line react/no-unstable-nested-components
      right={() => (
        <IconButton
          icon="delete-outline"
          iconColor={theme.error}
          onPress={onDelete}
          testID={`term-delete-${term.id}`}
        />
      )}
    />
  );
};

interface Props {
  terms: ReaderTerm[];
  onEdit: (term: ReaderTerm) => void;
  onDelete: (term: ReaderTerm) => void;
  emptyLabel: string;
  hasStyle: (style?: TermStyle) => boolean;
}

const TermList: React.FC<Props> = ({
  terms,
  onEdit,
  onDelete,
  emptyLabel,
  hasStyle,
}) => {
  const theme = useTheme();

  if (!terms.length) {
    return (
      <List.Section>
        <List.InfoItem title={emptyLabel} theme={theme} />
      </List.Section>
    );
  }

  return (
    <List.Section>
      {terms.map(term => (
        <TermRow
          key={term.id}
          term={term}
          onEdit={() => onEdit(term)}
          onDelete={() => onDelete(term)}
          hasStyle={hasStyle}
        />
      ))}
    </List.Section>
  );
};

export default TermList;

const styles = StyleSheet.create({
  replacement: { fontSize: 14 },
  badges: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  badge: { fontSize: 12, fontWeight: '700' },
});
