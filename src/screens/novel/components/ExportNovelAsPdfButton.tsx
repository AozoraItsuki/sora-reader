import { NovelInfo } from '@database/types';
import { useBoolean } from '@hooks/index';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import { MaterialDesignIconName } from '@type/icon';
import { showToast } from '@utils/showToast';
import React, { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Portal } from 'react-native-paper';

import ExportPdfLogsModal from './ExportPdfLogsModal';
import ExportPdfModal from './ExportPdfModal';

interface ExportNovelAsPdfButtonProps {
  novel?: NovelInfo;
  iconComponent: (props: {
    icon: MaterialDesignIconName;
    onPress: () => void;
    style?: StyleProp<ViewStyle>;
    size?: number;
  }) => React.JSX.Element;
}

const ExportNovelAsPdfButton: React.FC<ExportNovelAsPdfButtonProps> = ({
  novel,
  iconComponent: IconComponent,
}) => {
  const theme = useTheme();

  const {
    value: isModalVisible,
    setTrue: showModal,
    setFalse: hideModal,
  } = useBoolean(false);

  const [logsModalVisible, setLogsModalVisible] = React.useState(false);
  const [exportParams, setExportParams] = React.useState<{
    startChapter?: number;
    endChapter?: number;
  }>();

  const readerSettings = useChapterReaderSettings();
  const { epubUseAppTheme = false, epubUseCustomCSS = false } = readerSettings;

  const pdfStylesheet = useMemo(() => {
    if (!novel) {
      return '';
    }

    const appThemeStyles = epubUseAppTheme
      ? `
      body {
        padding: 0;
        font-size: ${readerSettings.textSize}px;
        color: ${readerSettings.textColor};
        text-align: ${readerSettings.textAlign};
        line-height: ${readerSettings.lineHeight};
        font-family: "${readerSettings.fontFamily}";
        background-color: "${readerSettings.theme}";
      }
      hr {
        margin-top: 20px;
        margin-bottom: 20px;
      }
      a {
        color: ${theme.primary};
      }`
      : '';

    const customStyles = epubUseCustomCSS
      ? readerSettings.customCSS
          .replace(RegExp(`#sourceId-${novel.pluginId}\\s*\\{`, 'g'), 'body {')
          .replace(RegExp(`#sourceId-${novel.pluginId}[^.#A-Z]*`, 'gi'), '')
      : '';

    return appThemeStyles + customStyles;
  }, [novel, epubUseAppTheme, epubUseCustomCSS, readerSettings, theme.primary]);

  const handleExportSubmit = (
    startChapter?: number,
    endChapter?: number,
  ) => {
    if (!novel) {
      showToast(getString('novelScreen.epub.noNovelSelected'));
      return;
    }

    setExportParams({ startChapter, endChapter });
    hideModal();
    setLogsModalVisible(true);
  };

  return (
    <>
      <IconComponent icon="file-pdf-box" onPress={showModal} />
      <Portal>
        <ExportPdfModal
          isVisible={isModalVisible}
          hideModal={hideModal}
          onSubmit={handleExportSubmit}
        />
        {novel && exportParams && (
          <ExportPdfLogsModal
            visible={logsModalVisible}
            onDismiss={() => setLogsModalVisible(false)}
            novel={novel}
            startChapter={exportParams.startChapter}
            endChapter={exportParams.endChapter}
            pdfStylesheet={pdfStylesheet}
          />
        )}
      </Portal>
    </>
  );
};

export default ExportNovelAsPdfButton;
