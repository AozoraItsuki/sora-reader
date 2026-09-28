import type { ReaderStackParamList } from '@navigators/types';
import type { RouteProp } from '@react-navigation/native';
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { NovelContextProvider, useNovelLayout } from '../NovelContext';

let mockInsets = { top: 24, right: 0, bottom: 48, left: 0 };
let mockOrientation = 'potrait';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

jest.mock('@hooks/index', () => ({
  useDeviceOrientation: () => mockOrientation,
}));

jest.mock('@components/Context/LibraryContext', () => ({
  useLibraryContext: () => ({ switchNovelToLibrary: jest.fn() }),
}));

jest.mock('@hooks/persisted', () => ({
  useAppSettings: () => ({ defaultChapterSort: 'positionAsc' }),
}));

jest.mock('@hooks/persisted/useNovel/store/createStore', () => ({
  createStore: () => ({ getState: () => ({}), subscribe: jest.fn() }),
}));

const PORTRAIT = { top: 24, right: 0, bottom: 48, left: 0 };
const LANDSCAPE = { top: 0, right: 44, bottom: 0, left: 44 };

const route = {
  params: { pluginId: 'plugin-id', path: '/novel/chapter-1' },
} as unknown as RouteProp<ReaderStackParamList, 'Chapter'>;

const LayoutProbe = () => {
  const { navigationBarHeight, statusBarHeight } = useNovelLayout();

  return (
    <Text testID="layout">{`${navigationBarHeight}:${statusBarHeight}`}</Text>
  );
};

const readLayout = () => {
  const rendered = screen.getByTestId('layout').props.children as string;
  const [navigationBarHeight, statusBarHeight] = rendered
    .split(':')
    .map(Number);
  return { navigationBarHeight, statusBarHeight };
};

const renderProvider = () =>
  render(
    <NovelContextProvider route={route}>
      <LayoutProbe />
    </NovelContextProvider>,
  );

describe('NovelContextProvider layout insets', () => {
  beforeEach(() => {
    mockInsets = PORTRAIT;
    mockOrientation = 'potrait';
  });

  it('reports the measured insets when the provider mounts', () => {
    // Given: a portrait window with measured insets
    // When: the provider renders
    // Then: consumers get those insets verbatim
    renderProvider();

    expect(readLayout()).toEqual({
      navigationBarHeight: 48,
      statusBarHeight: 24,
    });
  });

  it('shrinks the reported insets when the device rotates', () => {
    // Given: a portrait window with tall insets
    // When: the provider re-renders after rotating to a gesture-navigation landscape window
    // Then: the insets shrink instead of ratcheting up for the screen's lifetime
    const view = renderProvider();
    expect(readLayout().navigationBarHeight).toBe(48);

    mockInsets = LANDSCAPE;
    mockOrientation = 'landscape';
    view.rerender(
      <NovelContextProvider route={route}>
        <LayoutProbe />
      </NovelContextProvider>,
    );

    expect(readLayout()).toEqual({
      navigationBarHeight: 0,
      statusBarHeight: 0,
    });
  });

  it('keeps the last measured inset when a re-render transiently reports zero', () => {
    // Given: a provider that has already measured a navigation bar
    // When: a re-render transiently reports a zero inset
    // Then: consumers keep the measured value instead of collapsing to the screen edge
    const view = renderProvider();

    mockInsets = { ...PORTRAIT, bottom: 0 };
    view.rerender(
      <NovelContextProvider route={route}>
        <LayoutProbe />
      </NovelContextProvider>,
    );

    expect(readLayout().navigationBarHeight).toBe(48);
  });

  it('adopts a smaller inset without needing a rotation when the window shrinks', () => {
    // Given: a provider that measured a 48dp navigation bar
    // When: the window reports a 16dp inset in the same orientation
    // Then: the reported inset follows the window
    const view = renderProvider();

    mockInsets = { ...PORTRAIT, bottom: 16 };
    view.rerender(
      <NovelContextProvider route={route}>
        <LayoutProbe />
      </NovelContextProvider>,
    );

    expect(readLayout().navigationBarHeight).toBe(16);
  });
});
