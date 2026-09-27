import {
  Appbar,
  ErrorScreenV2,
  LoadingScreenV2,
  SafeAreaView,
} from '@components';
import { useTheme } from '@hooks/persisted';
import { PdfViewerScreenProps } from '@navigators/types';
import { getString } from '@strings/translations';
import { MaterialDesignIconName } from '@type/icon';
import { pdfDisplayName, resolvePdfSource } from '@utils/PdfSource';
import { showToast } from '@utils/showToast';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import FileViewer from 'react-native-file-viewer';
import PdfRendererView from 'react-native-pdf-renderer';

/** What the screen is currently showing. */
type ViewerState =
  | { status: 'preparing' }
  | { status: 'ready'; filePath: string }
  /** `filePath` is set when the file itself is readable, so it can be handed to an external viewer. */
  | { status: 'error'; message: string; filePath?: string };

type ViewerAction = {
  iconName: MaterialDesignIconName;
  title: string;
  onPress: () => void;
};

/**
 * In-app pdf viewer.
 *
 * `source` is whatever the caller has: an absolute path, a SAF `content://` uri
 * or an `http(s)://` url. `resolvePdfSource` normalizes all three into a path
 * the renderer can open.
 */
const PdfViewerScreen = ({ route, navigation }: PdfViewerScreenProps) => {
  const theme = useTheme();
  const { source } = route.params;
  const title = route.params.name || pdfDisplayName(source);

  const [state, setState] = useState<ViewerState>({ status: 'preparing' });

  const load = useCallback(async () => {
    setState({ status: 'preparing' });
    try {
      setState({ status: 'ready', filePath: await resolvePdfSource(source) });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [source]);

  useEffect(() => {
    // `load` reports its own failures through `state`, so there is no rejected
    // promise left dangling here.
    load();
  }, [load]);

  // The renderer rasterizes every page, so a document it chokes on (encrypted,
  // corrupt, or simply too large) stays broken: report it instead of spinning.
  const handleRenderError = useCallback(() => {
    setState(current =>
      current.status === 'ready'
        ? {
            status: 'error',
            message: getString('common.error'),
            filePath: current.filePath,
          }
        : current,
    );
  }, []);

  const openExternally = useCallback(
    async (filePath: string) => {
      try {
        // The external viewer only understands plain paths.
        await FileViewer.open(filePath);
      } catch (error) {
        showToast(
          `Failed to open "${title}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [title],
  );

  if (state.status === 'preparing') {
    return (
      <SafeAreaView style={styles.container}>
        <Appbar
          title={title}
          handleGoBack={() => navigation.goBack()}
          theme={theme}
          mode="small"
        />
        <LoadingScreenV2
          theme={theme}
          message={getString('common.preparing')}
        />
      </SafeAreaView>
    );
  }

  if (state.status === 'error') {
    const { filePath } = state;
    const actions: ViewerAction[] = [
      {
        iconName: 'refresh',
        title: getString('common.retry'),
        onPress: () => {
          load();
        },
      },
    ];
    if (filePath) {
      actions.push({
        iconName: 'open-in-new',
        title: 'Open in another app',
        onPress: () => {
          openExternally(filePath);
        },
      });
    }

    return (
      <SafeAreaView style={styles.container}>
        <Appbar
          title={title}
          handleGoBack={() => navigation.goBack()}
          theme={theme}
          mode="small"
        />
        <ErrorScreenV2 error={state.message} actions={actions} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Appbar
        title={title}
        handleGoBack={() => navigation.goBack()}
        theme={theme}
        mode="small"
      />
      <View style={styles.body}>
        <PdfRendererView
          style={styles.renderer}
          source={state.filePath}
          onError={handleRenderError}
          testID="pdf-renderer-view"
        />
      </View>
    </SafeAreaView>
  );
};

export default PdfViewerScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  renderer: {
    flex: 1,
  },
});
