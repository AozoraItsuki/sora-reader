import type { PdfViewerScreenProps } from '@navigators/types';
import { getString } from '@strings/translations';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { pdfCacheFilePath } from '@utils/PdfSource';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PdfViewerScreen from '../PdfViewerScreen';

const mockResolvePdfSource = jest.fn();
const mockOpen = jest.fn();

// Only the async entry point is faked: the cache naming is what decides which
// file the renderer ends up opening, so it stays real.
jest.mock('@utils/PdfSource', () => ({
  ...jest.requireActual('@utils/PdfSource'),
  resolvePdfSource: (source: string) => mockResolvePdfSource(source),
}));

jest.mock('react-native-file-viewer', () => ({
  __esModule: true,
  default: { open: (path: string) => mockOpen(path) },
}));

jest.mock('@hooks/persisted', () => {
  // The real settings barrel drags in the tracker services, which need a
  // generated env file. The bundled seed theme is all the shared screens read,
  // and the app ships exactly one, so it is read explicitly rather than picked
  // out of a catalogue: an empty seed must fail here, not render `undefined`.
  const { lightThemes } = jest.requireActual(
    '@theme/md3',
  ) as typeof import('@theme/md3');
  const seedTheme = lightThemes[0];

  if (!seedTheme) {
    throw new Error('Expected @theme/md3 to export a bundled seed theme');
  }

  return { useTheme: () => seedTheme };
});

jest.mock('@components/Appbar/Appbar', () => () => null);

const CONTENT_URI =
  'content://com.android.providers.downloads.documents/document/report.pdf';
const CACHE_PATH = pdfCacheFilePath(CONTENT_URI);
const EXTERNAL_ACTION = 'Open in another app';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = (params: PdfViewerScreenProps['route']['params']) => {
  const navigation = {
    goBack: jest.fn(),
  } as unknown as PdfViewerScreenProps['navigation'];
  const route = {
    key: 'pdf-viewer',
    name: 'PdfViewer',
    params,
  } as unknown as PdfViewerScreenProps['route'];

  render(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <PaperProvider>
          <PdfViewerScreen navigation={navigation} route={route} />
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
};

/** The mocked renderer is a plain view, so it is found by its test id. */
const RENDERER_TEST_ID = 'pdf-renderer-view';
const queryRenderer = () => screen.queryByTestId(RENDERER_TEST_ID);
/** Same node, but awaited: `findBy*` fails loudly instead of returning null. */
const findRenderer = () => screen.findByTestId(RENDERER_TEST_ID);

beforeEach(() => {
  jest.clearAllMocks();
  mockResolvePdfSource.mockResolvedValue(CACHE_PATH);
  mockOpen.mockResolvedValue(undefined);
});

describe('PdfViewerScreen', () => {
  it('shows a loading state until the source is a file on disk', async () => {
    // Given: a SAF uri that still has to be copied into the cache.
    let finish: (path: string) => void = () => undefined;
    mockResolvePdfSource.mockReturnValue(
      new Promise<string>(done => {
        finish = done;
      }),
    );

    renderScreen({ source: CONTENT_URI });

    // Then: the renderer has nothing to open yet, so the screen waits.
    expect(screen.getByText(getString('common.preparing'))).toBeTruthy();
    expect(queryRenderer()).toBeNull();
    expect(mockResolvePdfSource).toHaveBeenCalledWith(CONTENT_URI);

    finish(CACHE_PATH);

    await findRenderer();
    expect(screen.queryByText(getString('common.preparing'))).toBeNull();
  });

  it('opens the resolved cache copy rather than the content uri', async () => {
    renderScreen({ source: CONTENT_URI });

    const view = await findRenderer();
    // The renderer can only open a path, so the copy must be what it gets.
    expect(view.props.source).toBe(CACHE_PATH);
    expect(view.props.source).not.toBe(CONTENT_URI);
  });

  it('opens a local path as it stands, without a copy', async () => {
    const localPath = '/storage/emulated/0/Download/novel.pdf';
    mockResolvePdfSource.mockResolvedValue(localPath);

    renderScreen({ source: localPath });

    expect((await findRenderer()).props.source).toBe(localPath);
  });

  it('reports a source it could not open and offers a retry', async () => {
    // Given: a uri that no longer resolves to a readable file.
    mockResolvePdfSource.mockRejectedValue(
      new Error('ENOENT: no such document'),
    );

    renderScreen({ source: CONTENT_URI });

    // Then: the reason is on screen, and there is nothing to hand to an
    // external viewer.
    expect(await screen.findByText(/ENOENT: no such document/)).toBeTruthy();
    expect(queryRenderer()).toBeNull();
    expect(screen.queryByText(EXTERNAL_ACTION)).toBeNull();

    // When: the user retries and the copy succeeds.
    mockResolvePdfSource.mockResolvedValue(CACHE_PATH);
    fireEvent.press(screen.getByText(getString('common.retry')));

    await findRenderer();
  });

  it('keeps the file available for an external viewer when the renderer fails', async () => {
    renderScreen({ source: CONTENT_URI });

    const view = await findRenderer();

    // When: the document opened but the renderer could not draw it.
    fireEvent(view, 'error');

    // Then: the error is reported, yet the file is still on disk, so the user
    // can hand it to an installed pdf app.
    expect(await screen.findByText(getString('common.error'))).toBeTruthy();
    expect(queryRenderer()).toBeNull();

    fireEvent.press(screen.getByText(EXTERNAL_ACTION));

    await waitFor(() => expect(mockOpen).toHaveBeenCalledWith(CACHE_PATH));
  });

  it('does not offer an external viewer when nothing was ever opened', async () => {
    // Given: a source that never resolved to a file.
    mockResolvePdfSource.mockRejectedValue(new Error('HTTP 404'));

    renderScreen({ source: 'https://example.com/files/gone.pdf' });

    // Then: there is no path to hand over, so only a retry is offered.
    expect(await screen.findByText(/HTTP 404/)).toBeTruthy();
    expect(screen.queryByText(EXTERNAL_ACTION)).toBeNull();
  });
});
