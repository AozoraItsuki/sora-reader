import { Appbar, Button, List, SafeAreaView } from '@components';
import { SegmentedControl } from '@components/SegmentedControl';
import { getAllNovels } from '@database/queries/NovelQueries';
import { NovelInfo } from '@database/types';
import { useTheme } from '@hooks/persisted';
import { TermsSettingsScreenProps } from '@navigators/types';
import { getString } from '@strings/translations';
import {
  getGlobalTerms,
  getNovelTerms,
  hasTermStyle,
  ReaderTerm,
  saveGlobalTerms,
  saveNovelTerms,
} from '@utils/readerTerms';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import TermEditorModal from './TermEditorModal';
import TermList from './TermList';
import { TermDraft } from './TermStyleEditor';

type Tab = 'global' | 'novel';

const generateId = () => Math.random().toString(36).slice(2, 10);

const SettingsTermsScreen = ({ navigation }: TermsSettingsScreenProps) => {
  const theme = useTheme();

  const [tab, setTab] = useState<Tab>('global');
  const [novels, setNovels] = useState<NovelInfo[]>([]);
  const [selectedNovel, setSelectedNovel] = useState<NovelInfo | null>(null);
  const [globalTerms, setGlobalTerms] = useState<ReaderTerm[]>([]);
  const [novelTerms, setNovelTerms] = useState<ReaderTerm[]>([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTerm, setEditingTerm] = useState<ReaderTerm | undefined>(
    undefined,
  );

  useEffect(() => {
    getAllNovels().then(setNovels);
  }, []);

  const refreshGlobal = useCallback(() => {
    setGlobalTerms(getGlobalTerms());
  }, []);

  const refreshNovel = useCallback((novelId: number) => {
    setNovelTerms(getNovelTerms(novelId));
  }, []);

  useEffect(() => {
    if (tab === 'global') {
      refreshGlobal();
    } else if (selectedNovel) {
      refreshNovel(selectedNovel.id);
    }
  }, [tab, selectedNovel, refreshGlobal, refreshNovel]);

  const openAdd = () => {
    setEditingTerm(undefined);
    setEditorVisible(true);
  };

  const openEdit = (term: ReaderTerm) => {
    setEditingTerm(term);
    setEditorVisible(true);
  };

  const closeEditor = () => {
    setEditorVisible(false);
    setEditingTerm(undefined);
  };

  const handleSave = (draft: TermDraft) => {
    const scope: ReaderTerm['scope'] = tab === 'global' ? 'global' : 'novel';
    const target =
      scope === 'global'
        ? {
            terms: globalTerms,
            persist: saveGlobalTerms,
            reload: refreshGlobal,
          }
        : selectedNovel
        ? {
            terms: novelTerms,
            persist: (terms: ReaderTerm[]) =>
              saveNovelTerms(selectedNovel.id, terms),
            reload: () => refreshNovel(selectedNovel.id),
          }
        : null;

    if (!target) {
      closeEditor();
      return;
    }

    const saved: ReaderTerm = {
      id: editingTerm?.id ?? generateId(),
      from: draft.from.trim(),
      to: draft.to,
      scope,
      caseSensitive: draft.caseSensitive,
      style: draft.style,
    };
    target.persist(
      editingTerm
        ? target.terms.map(term => (term.id === saved.id ? saved : term))
        : [...target.terms, saved],
    );
    target.reload();
    closeEditor();
  };

  const handleDelete = (term: ReaderTerm) => {
    if (tab === 'global') {
      saveGlobalTerms(globalTerms.filter(t => t.id !== term.id));
      refreshGlobal();
    } else if (selectedNovel) {
      saveNovelTerms(
        selectedNovel.id,
        novelTerms.filter(t => t.id !== term.id),
      );
      refreshNovel(selectedNovel.id);
    }
  };

  const scopeLabel =
    tab === 'global'
      ? getString('termsSettingsScreen.scopeGlobal')
      : selectedNovel?.name ?? getString('termsSettingsScreen.scopeNovel');

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('termsSettings')}
        handleGoBack={() => navigation.goBack()}
        theme={theme}
      />
      <View style={styles.tabBar}>
        <SegmentedControl
          value={tab}
          onChange={value => setTab(value as Tab)}
          theme={theme}
          options={[
            {
              value: 'global',
              label: getString('termsSettingsScreen.globalTab'),
            },
            {
              value: 'novel',
              label: getString('termsSettingsScreen.perNovelTab'),
            },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'global' ? (
          <>
            <List.Section>
              <List.SubHeader theme={theme}>
                {getString('termsSettingsScreen.globalTerms')}
              </List.SubHeader>
              <List.InfoItem
                title={getString('termsSettingsScreen.globalTermsDesc')}
                theme={theme}
              />
            </List.Section>
            <TermList
              terms={globalTerms}
              onEdit={openEdit}
              onDelete={handleDelete}
              emptyLabel={getString('termsSettingsScreen.noGlobalTerms')}
              hasStyle={hasTermStyle}
            />
            <Button
              title={getString('termsSettingsScreen.addTerm')}
              icon="plus"
              mode="contained"
              onPress={openAdd}
              style={styles.addButton}
            />
          </>
        ) : (
          <>
            <List.Section>
              <List.SubHeader theme={theme}>
                {getString('termsSettingsScreen.novelPicker')}
              </List.SubHeader>
              {novels.length === 0 ? (
                <List.InfoItem
                  title={getString('termsSettingsScreen.noNovels')}
                  theme={theme}
                />
              ) : (
                novels.map(novel => (
                  <List.Item
                    key={novel.id}
                    title={novel.name}
                    icon={
                      selectedNovel?.id === novel.id
                        ? 'bookmark'
                        : 'bookmark-outline'
                    }
                    onPress={() => setSelectedNovel(novel)}
                    theme={theme}
                  />
                ))
              )}
            </List.Section>
            {selectedNovel ? (
              <>
                <Text style={[styles.sectionTitle, { color: theme.primary }]}>
                  {getString('termsSettingsScreen.novelTerms')}
                </Text>
                <TermList
                  terms={novelTerms}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  emptyLabel={getString('termsSettingsScreen.noNovelTerms')}
                  hasStyle={hasTermStyle}
                />
                <Button
                  title={getString('termsSettingsScreen.addTerm')}
                  icon="plus"
                  mode="contained"
                  onPress={openAdd}
                  style={styles.addButton}
                />
              </>
            ) : (
              <List.InfoItem
                title={getString('termsSettingsScreen.selectNovelFirst')}
                theme={theme}
              />
            )}
          </>
        )}
      </ScrollView>
      <TermEditorModal
        visible={editorVisible}
        term={editingTerm}
        scopeLabel={scopeLabel}
        onDismiss={closeEditor}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
};

export default SettingsTermsScreen;

const styles = StyleSheet.create({
  tabBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  content: { paddingBottom: 32 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  addButton: { marginHorizontal: 16, marginTop: 16 },
});
