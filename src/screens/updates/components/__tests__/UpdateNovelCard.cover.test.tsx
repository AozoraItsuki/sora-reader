import { defaultCover } from '@plugins/helpers/constants';
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import UpdateNovelCard from '../UpdateNovelCard';

// The local server is down: a tree-relative DB path is truthy but unloadable.
jest.mock('@plugins/local/localServerManager', () => ({
  getLocalServerUrl: jest.fn(() => ''),
}));
jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: jest.fn(() => 'test-agent'),
}));
jest.mock('@services/saf/safFile', () => ({
  getDirectRootAbsolute: jest.fn(() => null),
}));
jest.mock('@plugins/pluginManager', () => ({ LOCAL_PLUGIN_ID: 'local' }));
jest.mock('@components/Context/UpdateContext', () => ({
  useUpdateContext: jest.fn(() => ({
    getDetailedUpdates: jest.fn(() => Promise.resolve([])),
    isLoading: false,
  })),
}));
jest.mock('@hooks/persisted', () => ({
  useDownload: jest.fn(() => ({
    downloadChapter: jest.fn(),
    downloadingChapterIds: new Set<number>(),
  })),
  useTheme: jest.fn(() => ({ onSurface: '#000000' })),
}));
jest.mock('@screens/novel/components/ChapterItem', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ left }: { left: unknown }) =>
      ReactModule.createElement(View, { testID: 'chapter-item' }, left),
  };
});
jest.mock('react-native-paper', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    List: {
      Accordion: ({ left }: { left: () => unknown }) =>
        ReactModule.createElement(View, { testID: 'accordion' }, left()),
    },
  };
});

const { getDirectRootAbsolute } = jest.requireMock('@services/saf/safFile') as {
  getDirectRootAbsolute: jest.Mock;
};

const RELATIVE_COVER = 'Novels/updates/7/other.png';

const update = {
  id: 101,
  novelId: 7,
  path: 'Novels/updates/7/1/index.html',
  name: 'Chapter 1',
  readTime: null,
  bookmark: false,
  unread: true,
  isDownloaded: false,
  updatedTime: '2026-11-20 10:00:00',
  page: '1',
  progress: 0,
  pluginId: 'updates',
  novelName: 'Test Novel',
  novelPath: 'Novels/updates/7',
  novelCover: RELATIVE_COVER,
};

type JsonNode = {
  type: string;
  props: { source?: { uri?: string }; onError?: unknown };
  children: (JsonNode | string | null)[] | null;
};

/** Walk the rendered host tree to find every Image's props. */
const images = (node: JsonNode | string | null): JsonNode[] => {
  if (!node || typeof node === 'string') {
    return [];
  }
  return [
    ...(node.type === 'Image' ? [node] : []),
    ...(node.children ?? []).flatMap(images),
  ];
};

beforeEach(() => {
  getDirectRootAbsolute.mockReturnValue(null);
});

describe('UpdateNovelCard cover', () => {
  it('never passes a raw tree-relative path to Image on a single chapter', () => {
    const view = render(
      <UpdateNovelCard
        chapterList={[update]}
        descriptionText="chapters updated"
        deleteChapter={jest.fn()}
      />,
    );

    expect(images(view.toJSON()).map(i => i.props.source?.uri)).toEqual([
      defaultCover,
    ]);
  });

  it('never passes a raw tree-relative path to Image in the accordion left', () => {
    const view = render(
      <UpdateNovelCard
        chapterListInfo={{
          novelId: 7,
          pluginId: 'updates',
          novelName: 'Test Novel',
          updateDate: '2026-11-20',
          updatesPerDay: 2,
          novelCover: RELATIVE_COVER,
        }}
        descriptionText="chapters updated"
        deleteChapter={jest.fn()}
      />,
    );

    expect(screen.getByTestId('accordion')).toBeTruthy();
    expect(images(view.toJSON()).map(i => i.props.source?.uri)).toEqual([
      defaultCover,
    ]);
  });

  it('uses the overview pluginId to find an on-disk cover on first render', () => {
    getDirectRootAbsolute.mockReturnValue('/mock/root');

    const view = render(
      <UpdateNovelCard
        chapterListInfo={{
          novelId: 7,
          pluginId: 'updates',
          novelName: 'Test Novel',
          updateDate: '2026-11-20',
          updatesPerDay: 2,
          novelCover: null,
        }}
        descriptionText="chapters updated"
        deleteChapter={jest.fn()}
      />,
    );

    const image = images(view.toJSON())[0];
    expect(image.props.source?.uri).toBe(
      'file:///mock/root/Novels/updates/7/cover.png',
    );
    expect(typeof image.props.onError).toBe('function');
  });
});
