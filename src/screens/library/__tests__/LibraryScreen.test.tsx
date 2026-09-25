import type { ReactNode } from 'react';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { History } from '@database/types';
import type { LibraryScreenProps } from '@navigators/types';

import LibraryScreen from '../LibraryScreen';

const mockNavigate = jest.fn();
let mockHistory: History[] = [];

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
    isFocused: jest.fn(() => true),
    navigate: mockNavigate,
  }),
  useRoute: () => ({ key: 'Library-test', name: 'Library' }),
}));

jest.mock('@components/Actionbar/Actionbar', () => ({
  Actionbar: () => null,
}));

jest.mock('@components/Common', () => ({
  Row: () => null,
}));

jest.mock('@components/Context/LibraryContext', () => ({
  useLibraryContext: () => ({
    library: [],
    categories: [],
    refetchLibrary: jest.fn(),
    isLoading: false,
    settings: {
      showNumberOfNovels: false,
      downloadedOnlyMode: false,
      incognitoMode: false,
    },
  }),
}));

jest.mock('@components/index', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Button: () => null,
    SafeAreaView: ({ children }: { children?: ReactNode }) =>
      React.createElement(View, null, children),
    SearchbarV2: () => null,
  };
});

jest.mock('@database/queries/ChapterQueries', () => ({
  markAllChaptersRead: jest.fn(),
  markAllChaptersUnread: jest.fn(),
}));

jest.mock('@database/queries/NovelQueries', () => ({
  removeNovelsFromLibrary: jest.fn(),
}));

jest.mock('@hooks', () => ({
  useBackHandler: () => jest.fn(),
  useBoolean: () => ({
    value: false,
    setTrue: jest.fn(),
    setFalse: jest.fn(),
  }),
  useSearch: () => ({
    searchText: '',
    setSearchText: jest.fn(),
    clearSearchbar: jest.fn(),
  }),
}));

jest.mock('@hooks/persisted', () => ({
  useAppSettings: () => ({ useLibraryFAB: true }),
  useHistory: () => ({ isLoading: false, history: mockHistory }),
  useTheme: () => ({
    isDark: false,
    primary: '#111111',
    onPrimary: '#ffffff',
    secondary: '#222222',
    surface: '#333333',
    surfaceVariant: '#444444',
    onSurfaceVariant: '#555555',
    rippleColor: '#666666',
  }),
}));

jest.mock('@hooks/persisted/useImport', () => ({
  __esModule: true,
  default: () => ({ importNovel: jest.fn() }),
}));

jest.mock('@plugins/pluginManager', () => ({ LOCAL_PLUGIN_ID: 'local' }));

jest.mock(
  '@screens/browse/loadingAnimation/SourceScreenSkeletonLoading',
  () => ({
    __esModule: true,
    default: () => null,
  }),
);

jest.mock('@services/ServiceManager', () => ({
  __esModule: true,
  default: { manager: { addTask: jest.fn() } },
}));

jest.mock('@strings/translations', () => ({
  getString: (key: string) => key,
}));

jest.mock('color', () => ({
  __esModule: true,
  default: () => ({ alpha: () => ({ string: () => '#00000012' }) }),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('lodash-es', () => ({
  xor: () => [],
}));

jest.mock('react-native-paper', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');

  return {
    FAB: ({ label, onPress }: { label: string; onPress: () => void }) =>
      React.createElement(
        Pressable,
        { testID: 'library-resume-fab', onPress },
        React.createElement(Text, null, label),
      ),
    Portal: ({ children }: { children?: ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0 }),
}));

jest.mock('react-native-tab-view', () => ({
  TabBar: () => null,
  TabView: () => null,
}));

jest.mock('../components/Banner', () => ({ Banner: () => null }));

jest.mock('../components/LibraryBottomSheet/LibraryBottomSheet', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/LibraryListView', () => ({
  LibraryView: () => null,
}));

jest.mock('@screens/novel/components/SetCategoriesModal', () => ({
  __esModule: true,
  default: () => null,
}));

const olderHistoryChapter: History = {
  id: 1,
  novelId: 8,
  path: '/chapter/1',
  name: 'Chapter 1',
  releaseTime: '2026-01-01',
  updatedTime: '2026-01-01',
  readTime: '2026-01-01T10:00:00',
  chapterNumber: 1,
  bookmark: false,
  progress: 0,
  charOffset: 0,
  page: '1',
  unread: true,
  isDownloaded: false,
  pluginId: 'other.plugin',
  novelName: 'Other Novel',
  novelPath: '/novel/other',
  novelCover: null,
};

const targetChapter: History = {
  ...olderHistoryChapter,
  id: 42,
  novelId: 7,
  path: '/chapter/42',
  name: 'Chapter 42',
  readTime: '2026-01-02T10:00:00',
  chapterNumber: 42,
  progress: 0.73,
  charOffset: 812,
  unread: false,
  pluginId: 'plugin.test',
  novelName: 'Test Novel',
  novelPath: '/novel/test',
};

const LibraryHarness = () => {
  const navigation = useNavigation<LibraryScreenProps['navigation']>();
  const route = useRoute<LibraryScreenProps['route']>();

  return <LibraryScreen navigation={navigation} route={route} />;
};

describe('LibraryScreen resume consumer', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockHistory = [];
  });

  it('navigates to the corrected first history target when base and target identities differ', () => {
    // Given: the history contract returns the corrected target before older base records.
    mockHistory = [targetChapter, olderHistoryChapter];
    render(<LibraryHarness />);

    // When: the user presses Resume.
    fireEvent.press(screen.getByTestId('library-resume-fab'));

    // Then: navigation preserves the target chapter identity, progress, and character offset.
    expect(mockNavigate).toHaveBeenCalledWith('ReaderStack', {
      screen: 'Chapter',
      params: {
        novel: {
          id: targetChapter.novelId,
          path: targetChapter.novelPath,
          pluginId: targetChapter.pluginId,
          name: targetChapter.novelName,
          isLocal: false,
        },
        chapter: targetChapter,
      },
    });
  });
});
