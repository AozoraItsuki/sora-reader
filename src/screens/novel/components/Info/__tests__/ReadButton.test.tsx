import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ChapterInfo } from '@database/types';

import ReadButton from '../ReadButton';

jest.mock('@components', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');

  return {
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(
        Pressable,
        { testID: 'read-button', onPress },
        React.createElement(Text, null, title),
      ),
  };
});

jest.mock('@hooks/persisted', () => ({
  useAppSettings: () => ({ useFabForContinueReading: false }),
}));

jest.mock('@strings/translations', () => ({
  getString: (key: string) => key,
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: { View },
    ZoomIn: { duration: jest.fn() },
  };
});

const baseChapter: ChapterInfo = {
  id: 1,
  novelId: 7,
  path: '/chapter/1',
  name: 'Chapter 1',
  releaseTime: '2026-01-01',
  updatedTime: '2026-01-01',
  readTime: '2026-01-01',
  chapterNumber: 1,
  bookmark: false,
  progress: 0,
  charOffset: 0,
  page: '1',
  unread: true,
  isDownloaded: false,
};

const targetChapter: ChapterInfo = {
  ...baseChapter,
  id: 42,
  path: '/chapter/42',
  name: 'Chapter 42',
  readTime: '2026-01-02',
  chapterNumber: 42,
  progress: 0.73,
  charOffset: 812,
  unread: false,
};

describe('ReadButton resume consumer', () => {
  it('passes the current lastRead target to chapter navigation when first unread is stale', () => {
    // Given: the novel list still exposes an older first-unread chapter.
    const navigateToChapter = jest.fn();
    render(
      <ReadButton
        firstUnreadChapter={baseChapter}
        lastRead={targetChapter}
        navigateToChapter={navigateToChapter}
      />,
    );

    // When: the user presses Continue Reading.
    fireEvent.press(screen.getByTestId('read-button'));

    // Then: the current target identity and offset are selected.
    expect(navigateToChapter).toHaveBeenCalledWith(targetChapter);
  });
});
