import { useTheme } from '@hooks/persisted';
import {
  getGlobalTerms,
  getNovelTerms,
  ReaderTerm,
  saveGlobalTerms,
  saveNovelTerms,
} from '@utils/readerTerms';
import React, { useCallback, useEffect, useState } from 'react';
import {
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

interface Props {
  visible: boolean;
  onClose: () => void;
  novelId: number;
  novelName: string;
  onTermsChanged?: () => void;
}

type TabKey = 'editor' | 'terms' | 'config';

const MAX_LEN = 128;
const generateId = () => Math.random().toString(36).slice(2, 10);

const EditTermsModal: React.FC<Props> = ({
  visible,
  onClose,
  novelId,
  novelName,
  onTermsChanged,
}) => {
  const theme = useTheme();
  const [tab, setTab] = useState<TabKey>('editor');
  const [novelTerms, setNovelTerms] = useState<ReaderTerm[]>([]);
  const [globalTerms, setGlobalTerms] = useState<ReaderTerm[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [novelOnly, setNovelOnly] = useState(true);
  const [fromFocused, setFromFocused] = useState(false);
  const [toFocused, setToFocused] = useState(false);
  const [multiDelete, setMultiDelete] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const loadTerms = useCallback(() => {
    setNovelTerms(getNovelTerms(novelId));
    setGlobalTerms(getGlobalTerms());
  }, [novelId]);

  useEffect(() => {
    if (visible) {
      const nTerms = getNovelTerms(novelId);
      const gTerms = getGlobalTerms();
      setNovelTerms(nTerms);
      setGlobalTerms(gTerms);
      resetForm();
      // Show terms list if there are existing terms, otherwise show editor
      const hasTerms = nTerms.length > 0 || gTerms.length > 0;
      setTab(hasTerms ? 'terms' : 'editor');
    }
  }, [visible, novelId]);

  const resetForm = () => {
    setEditingId(null);
    setFromText('');
    setToText('');
    setCaseSensitive(false);
    setNovelOnly(true);
    setFromFocused(false);
    setToFocused(false);
  };

  const openEdit = (term: ReaderTerm) => {
    setEditingId(term.id);
    setFromText(term.from);
    setToText(term.to);
    setCaseSensitive(term.caseSensitive);
    setNovelOnly(term.scope === 'novel');
    setTab('editor');
  };

  const saveTerm = () => {
    if (!fromText.trim()) return;
    const scope: 'novel' | 'global' = novelOnly ? 'novel' : 'global';
    const newTerm: ReaderTerm = {
      id: editingId ?? generateId(),
      from: fromText.trim(),
      to: toText,
      scope,
      caseSensitive,
    };

    const gTerms = getGlobalTerms();
    const nTerms = getNovelTerms(novelId);

    if (editingId) {
      const inGlobal = gTerms.some(t => t.id === editingId);
      const inNovel = nTerms.some(t => t.id === editingId);
      if (inGlobal && scope === 'global') {
        saveGlobalTerms(gTerms.map(t => (t.id === editingId ? newTerm : t)));
      } else if (inGlobal && scope === 'novel') {
        saveGlobalTerms(gTerms.filter(t => t.id !== editingId));
        saveNovelTerms(novelId, [...nTerms, newTerm]);
      } else if (inNovel && scope === 'novel') {
        saveNovelTerms(novelId, nTerms.map(t => (t.id === editingId ? newTerm : t)));
      } else if (inNovel && scope === 'global') {
        saveNovelTerms(novelId, nTerms.filter(t => t.id !== editingId));
        saveGlobalTerms([...gTerms, newTerm]);
      }
    } else {
      if (scope === 'global') {
        saveGlobalTerms([...gTerms, newTerm]);
      } else {
        saveNovelTerms(novelId, [...nTerms, newTerm]);
      }
    }

    resetForm();
    loadTerms();
    onTermsChanged?.();
    setTab('terms');
  };

  const deleteTerm = (term: ReaderTerm) => {
    if (term.scope === 'global') {
      saveGlobalTerms(getGlobalTerms().filter(t => t.id !== term.id));
    } else {
      saveNovelTerms(novelId, getNovelTerms(novelId).filter(t => t.id !== term.id));
    }
    loadTerms();
    onTermsChanged?.();
  };

  const deleteSelected = () => {
    const gFiltered = getGlobalTerms().filter(t => !selected.includes(t.id));
    const nFiltered = getNovelTerms(novelId).filter(t => !selected.includes(t.id));
    saveGlobalTerms(gFiltered);
    saveNovelTerms(novelId, nFiltered);
    setSelected([]);
    loadTerms();
    onTermsChanged?.();
  };

  const toggleSelect = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const dividerColor = theme.outline + '33';
  const cardBg = theme.surfaceVariant + 'AA';
  const accentColor = theme.primary;

  const renderTermRow = (term: ReaderTerm) => {
    const isSelected = selected.includes(term.id);
    return (
      <View
        key={term.id}
        style={[
          styles.termRow,
          { borderBottomColor: dividerColor },
          isSelected && { backgroundColor: accentColor + '22' },
        ]}
      >
        {multiDelete ? (
          <Pressable
            style={[
              styles.checkBox,
              {
                borderColor: isSelected ? accentColor : theme.outline,
                backgroundColor: isSelected ? accentColor : 'transparent',
              },
            ]}
            onPress={() => toggleSelect(term.id)}
          >
            {isSelected && (
              <Text style={{ color: theme.onPrimary, fontSize: 10, fontWeight: '700' }}>✓</Text>
            )}
          </Pressable>
        ) : (
          <TouchableOpacity
            style={[styles.editBtn, { borderColor: theme.outline }]}
            onPress={() => openEdit(term)}
          >
            <Text style={[styles.editBtnText, { color: theme.onSurface }]}>Edit</Text>
          </TouchableOpacity>
        )}
        <View style={styles.termInfo}>
          <Text style={[styles.termFrom, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
            <Text style={{ fontWeight: '600', color: theme.onSurface }}>FROM: </Text>
            {term.from}
          </Text>
          <Text style={[styles.termTo, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
            <Text style={{ fontWeight: '600', color: theme.onSurface }}>TO: </Text>
            {term.to || '(empty)'}
            {term.caseSensitive && (
              <Text style={[styles.caseBadge, { color: '#E07B3A' }]}> Case</Text>
            )}
          </Text>
        </View>
        {!multiDelete && (
          <TouchableOpacity onPress={() => deleteTerm(term)} style={styles.deleteBtn}>
            <Text style={{ color: theme.error ?? '#f44', fontSize: 16 }}>×</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEditorTab = () => (
    <ScrollView
      style={styles.tabContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.fieldHeaderRow}>
        <Text style={[styles.fieldLabel, { color: theme.onSurface }]}>
          Original Text ({fromText.length}/{MAX_LEN})
        </Text>
        <TouchableOpacity
          style={[styles.chipBtn, { borderColor: theme.outline }]}
          onPress={() => setFromText(t => t + '|')}
        >
          <Text style={[styles.chipBtnText, { color: theme.onSurfaceVariant }]}>+ Variation</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chipBtn, { borderColor: theme.outline }]}
          onPress={() => setFromText(t => t + '*')}
        >
          <Text style={[styles.chipBtnText, { color: theme.onSurfaceVariant }]}>+ Wild Char</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[
          styles.input,
          {
            color: theme.onSurface,
            backgroundColor: cardBg,
            borderColor: fromFocused ? accentColor : theme.outline + '66',
          },
        ]}
        value={fromText}
        onChangeText={t => setFromText(t.slice(0, MAX_LEN))}
        placeholder="Text to replace"
        placeholderTextColor={theme.onSurfaceVariant + '88'}
        onFocus={() => setFromFocused(true)}
        onBlur={() => setFromFocused(false)}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.hintRow}>
        <Text style={[styles.hintText, { color: theme.onSurfaceVariant }]}>
          Example: from_1|from_2|from_3...
        </Text>
        <View style={styles.caseRow}>
          <Switch
            value={caseSensitive}
            onValueChange={setCaseSensitive}
            trackColor={{ true: accentColor, false: theme.outline }}
            thumbColor={caseSensitive ? theme.onPrimary : theme.surfaceVariant}
            style={styles.smallSwitch}
          />
          <Text style={[styles.caseLabel, { color: theme.onSurface }]}>Case sensitive</Text>
        </View>
      </View>

      <Text style={[styles.fieldLabel, { color: theme.onSurface, marginTop: 12 }]}>
        Replacement Text ({toText.length}/{MAX_LEN})
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            color: theme.onSurface,
            backgroundColor: cardBg,
            borderColor: toFocused ? accentColor : theme.outline + '66',
          },
        ]}
        value={toText}
        onChangeText={t => setToText(t.slice(0, MAX_LEN))}
        placeholder="Text to replace with"
        placeholderTextColor={theme.onSurfaceVariant + '88'}
        onFocus={() => setToFocused(true)}
        onBlur={() => setToFocused(false)}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={[styles.divider, { backgroundColor: dividerColor }]} />

      <View style={styles.novelOnlyRow}>
        <Switch
          value={novelOnly}
          onValueChange={setNovelOnly}
          trackColor={{ true: accentColor, false: theme.outline }}
          thumbColor={novelOnly ? theme.onPrimary : theme.surfaceVariant}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.novelOnlyTitle, { color: theme.onSurface }]}>This Novel Only</Text>
          <Text style={[styles.novelOnlySubtitle, { color: theme.onSurfaceVariant }]}>
            This term will only apply to this novel.
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: dividerColor }]} />

      <View style={styles.editorActions}>
        <TouchableOpacity
          style={[styles.helpBtn, { borderColor: theme.outline }]}
          onPress={() => {}}
        >
          <Text style={[styles.helpBtnText, { color: theme.onSurfaceVariant }]}>?</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.closeActionBtn, { borderColor: theme.outline }]}
          onPress={onClose}
        >
          <Text style={[styles.closeActionBtnText, { color: theme.onSurface }]}>Close</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: accentColor, opacity: fromText.trim() ? 1 : 0.5 }]}
          onPress={saveTerm}
          disabled={!fromText.trim()}
        >
          <Text style={[styles.saveBtnText, { color: theme.onPrimary }]}>Save</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 8 }} />
    </ScrollView>
  );

  const renderTermsTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.termsToolbar}>
        <TouchableOpacity
          style={[
            styles.multiDeleteBtn,
            {
              borderColor: multiDelete ? accentColor : theme.outline,
              backgroundColor: multiDelete ? accentColor + '22' : 'transparent',
            },
          ]}
          onPress={() => {
            if (multiDelete && selected.length > 0) {
              deleteSelected();
            }
            setMultiDelete(m => !m);
            setSelected([]);
          }}
        >
          <Text style={[styles.multiDeleteText, { color: multiDelete ? accentColor : theme.onSurface }]}>
            {multiDelete && selected.length > 0
              ? `Delete (${selected.length})`
              : 'Enable Multi-Delete'}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionChip, { borderColor: theme.outline }]}>
            <Text style={[styles.sectionChipText, { color: theme.onSurface }]}>
              Current Novel
            </Text>
          </View>
          <TouchableOpacity style={styles.exportBtn}>
            <Text style={[styles.exportBtnText, { color: theme.onSurfaceVariant }]}>↗</Text>
          </TouchableOpacity>
        </View>
        {novelTerms.length === 0 && (
          <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
            No terms for this novel yet.
          </Text>
        )}
        {novelTerms.map(t => renderTermRow(t))}

        <View style={[styles.sectionHeaderRow, { marginTop: 8 }]}>
          <View style={[styles.sectionChip, { borderColor: theme.outline }]}>
            <Text style={[styles.sectionChipText, { color: theme.onSurface }]}>Global</Text>
          </View>
        </View>
        {globalTerms.length === 0 && (
          <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
            No global terms yet.
          </Text>
        )}
        {globalTerms.map(t => renderTermRow(t))}
        <View style={{ height: 16 }} />
      </ScrollView>
      <View style={[styles.termsBottomBar, { borderTopColor: dividerColor, backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={[styles.closeActionBtn, { borderColor: theme.outline }]}
          onPress={onClose}
        >
          <Text style={[styles.closeActionBtnText, { color: theme.onSurface }]}>Close</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addTermBtn, { backgroundColor: accentColor }]}
          onPress={() => {
            resetForm();
            setTab('editor');
          }}
        >
          <Text style={[styles.addTermBtnText, { color: theme.onPrimary }]}>+ Add New Term</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderConfigTab = () => (
    <View style={styles.configTab}>
      <Text style={[styles.configText, { color: theme.onSurfaceVariant }]}>
        No additional configuration available.
      </Text>
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
          <View style={[styles.tabBar, { borderBottomColor: dividerColor }]}>
            {(['editor', 'terms', 'config'] as TabKey[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.tabItem,
                  tab === t && { borderBottomColor: accentColor, borderBottomWidth: 2 },
                ]}
                onPress={() => setTab(t)}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: tab === t ? accentColor : theme.onSurfaceVariant },
                  ]}
                >
                  {t === 'editor' ? 'Editor' : t === 'terms' ? 'Your Terms' : 'Config'}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeTabBtn} onPress={onClose}>
              <Text style={[styles.closeTabText, { color: theme.onSurfaceVariant }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {tab === 'editor' && renderEditorTab()}
          {tab === 'terms' && renderTermsTab()}
          {tab === 'config' && renderConfigTab()}
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  container: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '72%',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  closeTabBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  closeTabText: {
    fontSize: 16,
  },
  tabContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  chipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipBtnText: {
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 6,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  hintText: {
    fontSize: 12,
    flex: 1,
  },
  caseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  smallSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  caseLabel: {
    fontSize: 13,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  novelOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  novelOnlyTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  novelOnlySubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  editorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  helpBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  closeActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  closeActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  termsToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  multiDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  multiDeleteText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  sectionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  exportBtn: {
    padding: 4,
  },
  exportBtnText: {
    fontSize: 16,
  },
  emptyText: {
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontStyle: 'italic',
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 44,
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  termInfo: {
    flex: 1,
    gap: 2,
  },
  termFrom: {
    fontSize: 13,
    lineHeight: 18,
  },
  termTo: {
    fontSize: 13,
    lineHeight: 18,
  },
  caseBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsBottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addTermBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  addTermBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  configTab: {
    padding: 24,
    alignItems: 'center',
  },
  configText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
