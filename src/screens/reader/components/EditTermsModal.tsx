import { useTheme } from '@hooks/persisted';
import {
  getAllTermsForNovel,
  getGlobalTerms,
  getNovelTerms,
  ReaderTerm,
  saveGlobalTerms,
  saveNovelTerms,
} from '@utils/readerTerms';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { IconButton } from 'react-native-paper';

interface Props {
  visible: boolean;
  onClose: () => void;
  novelId: number;
  novelName: string;
}

const generateId = () => Math.random().toString(36).slice(2, 10);

const EditTermsModal: React.FC<Props> = ({
  visible,
  onClose,
  novelId,
  novelName,
}) => {
  const theme = useTheme();
  const [terms, setTerms] = useState<ReaderTerm[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [scope, setScope] = useState<'novel' | 'global'>('novel');
  const [caseSensitive, setCaseSensitive] = useState(false);

  const loadTerms = useCallback(() => {
    const globalTerms = getGlobalTerms();
    const novelTerms = getNovelTerms(novelId);
    setTerms([...novelTerms, ...globalTerms]);
  }, [novelId]);

  useEffect(() => {
    if (visible) {
      loadTerms();
    }
  }, [visible, loadTerms]);

  const openAddForm = () => {
    setEditingId(null);
    setFromText('');
    setToText('');
    setScope('novel');
    setCaseSensitive(false);
    setShowForm(true);
  };

  const openEditForm = (term: ReaderTerm) => {
    setEditingId(term.id);
    setFromText(term.from);
    setToText(term.to);
    setScope(term.scope);
    setCaseSensitive(term.caseSensitive);
    setShowForm(true);
  };

  const saveTerm = () => {
    if (!fromText.trim()) {
      return;
    }
    const newTerm: ReaderTerm = {
      id: editingId ?? generateId(),
      from: fromText,
      to: toText,
      scope,
      caseSensitive,
    };

    const globalTerms = getGlobalTerms();
    const novelTerms = getNovelTerms(novelId);

    if (editingId) {
      const inGlobal = globalTerms.some(t => t.id === editingId);
      const inNovel = novelTerms.some(t => t.id === editingId);

      if (inGlobal && newTerm.scope === 'global') {
        saveGlobalTerms(globalTerms.map(t => (t.id === editingId ? newTerm : t)));
      } else if (inGlobal && newTerm.scope === 'novel') {
        saveGlobalTerms(globalTerms.filter(t => t.id !== editingId));
        saveNovelTerms(novelId, [...novelTerms, newTerm]);
      } else if (inNovel && newTerm.scope === 'novel') {
        saveNovelTerms(
          novelId,
          novelTerms.map(t => (t.id === editingId ? newTerm : t)),
        );
      } else if (inNovel && newTerm.scope === 'global') {
        saveNovelTerms(
          novelId,
          novelTerms.filter(t => t.id !== editingId),
        );
        saveGlobalTerms([...globalTerms, newTerm]);
      }
    } else {
      if (newTerm.scope === 'global') {
        saveGlobalTerms([...globalTerms, newTerm]);
      } else {
        saveNovelTerms(novelId, [...novelTerms, newTerm]);
      }
    }

    setShowForm(false);
    loadTerms();
  };

  const deleteTerm = (term: ReaderTerm) => {
    if (term.scope === 'global') {
      const globalTerms = getGlobalTerms();
      saveGlobalTerms(globalTerms.filter(t => t.id !== term.id));
    } else {
      const novelTerms = getNovelTerms(novelId);
      saveNovelTerms(
        novelId,
        novelTerms.filter(t => t.id !== term.id),
      );
    }
    loadTerms();
  };

  const renderTerm = ({ item }: { item: ReaderTerm }) => (
    <View
      style={[
        styles.termRow,
        { borderBottomColor: theme.outline + '44' },
      ]}
    >
      <View style={styles.termInfo}>
        <Text style={[styles.termFrom, { color: theme.onSurface }]} numberOfLines={1}>
          {item.from || '(empty)'}
        </Text>
        <Text style={[styles.termArrow, { color: theme.onSurfaceVariant }]}>→</Text>
        <Text style={[styles.termTo, { color: theme.primary }]} numberOfLines={1}>
          {item.to || '(empty)'}
        </Text>
      </View>
      <View style={styles.termMeta}>
        <Text style={[styles.termBadge, {
          color: item.scope === 'global' ? theme.secondary : theme.tertiary,
          borderColor: item.scope === 'global' ? theme.secondary : theme.tertiary,
        }]}>
          {item.scope === 'global' ? 'Global' : 'Novel'}
        </Text>
        {item.caseSensitive && (
          <Text style={[styles.termBadge, { color: theme.onSurfaceVariant, borderColor: theme.outline }]}>
            Aa
          </Text>
        )}
      </View>
      <View style={styles.termActions}>
        <IconButton
          icon="pencil"
          size={18}
          iconColor={theme.onSurfaceVariant}
          onPress={() => openEditForm(item)}
        />
        <IconButton
          icon="delete"
          size={18}
          iconColor={theme.error ?? '#f44'}
          onPress={() => deleteTerm(item)}
        />
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.container, { backgroundColor: theme.surface }]}>
          <View style={[styles.header, { borderBottomColor: theme.outline + '44' }]}>
            <Text style={[styles.title, { color: theme.onSurface }]}>Edit Terms</Text>
            <IconButton
              icon="close"
              iconColor={theme.onSurface}
              onPress={onClose}
            />
          </View>

          {showForm ? (
            <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>From (find)</Text>
              <TextInput
                style={[styles.input, {
                  color: theme.onSurface,
                  borderColor: theme.outline,
                  backgroundColor: theme.surfaceVariant,
                }]}
                value={fromText}
                onChangeText={setFromText}
                placeholder="Text to find"
                placeholderTextColor={theme.onSurfaceVariant}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>To (replace with)</Text>
              <TextInput
                style={[styles.input, {
                  color: theme.onSurface,
                  borderColor: theme.outline,
                  backgroundColor: theme.surfaceVariant,
                }]}
                value={toText}
                onChangeText={setToText}
                placeholder="Replace with"
                placeholderTextColor={theme.onSurfaceVariant}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>Scope</Text>
              <View style={styles.scopeRow}>
                <TouchableOpacity
                  style={[
                    styles.scopeBtn,
                    {
                      backgroundColor: scope === 'novel' ? theme.primary : theme.surfaceVariant,
                      borderColor: theme.outline,
                    },
                  ]}
                  onPress={() => setScope('novel')}
                >
                  <Text style={{
                    color: scope === 'novel' ? theme.onPrimary : theme.onSurface,
                    fontWeight: '600',
                  }}>
                    Only this novel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.scopeBtn,
                    {
                      backgroundColor: scope === 'global' ? theme.primary : theme.surfaceVariant,
                      borderColor: theme.outline,
                    },
                  ]}
                  onPress={() => setScope('global')}
                >
                  <Text style={{
                    color: scope === 'global' ? theme.onPrimary : theme.onSurface,
                    fontWeight: '600',
                  }}>
                    Global
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: theme.onSurface }]}>Case Sensitive</Text>
                <Switch
                  value={caseSensitive}
                  onValueChange={setCaseSensitive}
                  trackColor={{ true: theme.primary, false: theme.outline }}
                  thumbColor={caseSensitive ? theme.onPrimary : theme.surfaceVariant}
                />
              </View>
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: theme.outline }]}
                  onPress={() => setShowForm(false)}
                >
                  <Text style={{ color: theme.onSurface }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                  onPress={saveTerm}
                >
                  <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <>
              {terms.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
                    No terms yet. Tap + to add a text replacement.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={terms}
                  keyExtractor={item => item.id}
                  renderItem={renderTerm}
                  style={styles.list}
                />
              )}
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: theme.primary }]}
                onPress={openAddForm}
              >
                <Text style={[styles.addBtnText, { color: theme.onPrimary }]}>+ Add Term</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

export default EditTermsModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  termInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  termFrom: {
    flex: 1,
    fontSize: 14,
  },
  termArrow: {
    fontSize: 14,
  },
  termTo: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  termMeta: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 4,
  },
  termBadge: {
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  termActions: {
    flexDirection: 'row',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
  },
  addBtn: {
    margin: 16,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  form: {
    padding: 16,
  },
  label: {
    fontSize: 13,
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  switchLabel: {
    fontSize: 15,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    marginBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  saveBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
});
