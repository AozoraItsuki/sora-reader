import { ThemeProvider } from '@hooks/persisted/useTheme';
import { getString } from '@strings/translations';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { showToast } from '@utils/showToast';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DownloadsScreen from '../DownloadsScreen';

jest.mock('@hooks/persisted/useDownload', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@hooks/persisted', () => {
  const theme = jest.requireActual('@hooks/persisted/useTheme');
  const dl = jest.requireMock('@hooks/persisted/useDownload');
  return { useTheme: theme.useTheme, useDownload: dl.default };
});

jest.mock('@database/queries/ChapterQueries', () => ({
  getDownloadedChapters: jest.fn(() => []),
  deleteChapter: jest.fn(),
  deleteDownloads: jest.fn(),
}));

jest.mock('@screens/updates/components/UpdateNovelCard', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ chapterList }: any) => {
    const { Text } = require('react-native');
    return (
      <Text>{chapterList.map((c: { name: string }) => c.name).join(',')}</Text>
    );
  },
}));

jest.mock('@screens/updates/components/UpdatesSkeletonLoading', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/RemoveDownloadsDialog', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@components', () => ({
  Appbar: ({ title, children }: any) => {
    const { View, Text } = require('react-native');
    return (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    );
  },
  SafeAreaView: ({ children }: any) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
  List: { InfoItem: () => null },
}));

jest.mock('@components/EmptyView', () => ({
  __esModule: true,
  default: ({ description }: { description: string }) => {
    const { Text } = require('react-native');
    return <Text>{description}</Text>;
  },
}));

// Render every scene so both tabs are observable without pager gestures.
jest.mock('react-native-tab-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  const { Text: T } = require('react-native');
  return {
    TabView: ({ renderScene, renderTabBar, navigationState }: any) => (
      <View>
        {renderTabBar({ navigationState })}
        {navigationState.routes.map((r: { key: string }) => (
          <React.Fragment key={r.key}>
            {renderScene({ route: r })}
          </React.Fragment>
        ))}
      </View>
    ),
    TabBar: ({ navigationState }: any) => (
      <View>
        {navigationState.routes.map((r: { key: string; title: string }) => (
          <T key={r.key}>{r.title}</T>
        ))}
      </View>
    ),
  };
});

jest.mock('@utils/showToast', () => ({ showToast: jest.fn() }));

const mockUseDownload = jest.requireMock('@hooks/persisted/useDownload')
  .default as jest.Mock;
const mockToast = showToast as jest.Mock;

const baseDownloadHook = {
  downloadQueue: [],
  downloadingChapterIds: new Set<number>(),
  resumeDownload: jest.fn(),
  downloadChapter: jest.fn(),
  downloadChapters: jest.fn(),
  pauseDownload: jest.fn(),
  cancelDownload: jest.fn(),
  cancelChapterDownload: jest.fn(),
};

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = () =>
  render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <PaperProvider>
          <ThemeProvider>
            <DownloadsScreen navigation={{ goBack: jest.fn() } as any} />
          </ThemeProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );

describe('DownloadsScreen tabs', () => {
  beforeEach(() => {
    mockToast.mockClear();
    mockUseDownload.mockReset();
    mockUseDownload.mockReturnValue({ ...baseDownloadHook });
  });

  it('renders both Terunduh and Antrean tab titles', async () => {
    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText(getString('downloadScreen.downloaded')),
      ).toBeTruthy();
      expect(screen.getByText(getString('downloadScreen.queue'))).toBeTruthy();
    });
  });

  it('lists queued chapters and cancels one via the close button', async () => {
    const cancelChapterDownload = jest.fn();
    mockUseDownload.mockReturnValue({
      ...baseDownloadHook,
      downloadQueue: [
        {
          id: 'task-1',
          task: {
            name: 'DOWNLOAD_CHAPTER',
            data: {
              chapterId: 7,
              novelId: 3,
              novelName: 'Novel A',
              chapterName: 'Chapter 7',
            },
          },
          meta: {},
        },
      ],
      cancelChapterDownload,
    });
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Chapter 7')).toBeTruthy();
      expect(screen.getByText('Novel A')).toBeTruthy();
    });

    const closeButtons = screen.getAllByRole('button');
    fireEvent.press(closeButtons[closeButtons.length - 1]);

    expect(cancelChapterDownload).toHaveBeenCalledWith(7);
    expect(mockToast).toHaveBeenCalledWith(
      getString('downloadScreen.cancelled'),
    );
  });

  it('shows the empty queue label when nothing is queued', async () => {
    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText(getString('downloadScreen.noQueuedDownloads')),
      ).toBeTruthy();
    });
  });
});
