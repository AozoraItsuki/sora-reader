import { renderHook, waitFor } from '@testing-library/react-native';
import type { History } from '@database/types';

import useHistory from '../useHistory';

const mockGetHistoryFromDb = jest.fn();

jest.mock('@database/queries/HistoryQueries', () => ({
  getHistoryFromDb: () => mockGetHistoryFromDb(),
  deleteAllHistory: jest.fn(),
  deleteChapterHistory: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');

  return {
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});

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

describe('useHistory resume data contract', () => {
  it('preserves the corrected target identity and offset at the head of history', async () => {
    // Given: the database history layer returns the target before the older base record.
    mockGetHistoryFromDb.mockResolvedValue([
      targetChapter,
      olderHistoryChapter,
    ]);

    // When: the focused history consumer loads the records.
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Then: the head record remains the current target rather than a stale/base chapter.
    expect(result.current.history[0]).toMatchObject({
      id: targetChapter.id,
      path: targetChapter.path,
      progress: targetChapter.progress,
      charOffset: targetChapter.charOffset,
    });
  });
});
