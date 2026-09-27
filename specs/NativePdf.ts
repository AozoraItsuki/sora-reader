import { TurboModule, TurboModuleRegistry } from 'react-native';

/** One rasterized PDF page: its extracted text plus the PNG render of it. */
export interface PdfPage {
  /** 1-based page number, matching what a reader sees in a pdf viewer. */
  pageNumber: number;
  /**
   * Text layer of the page, or '' when the page has none or the platform
   * declines to hand one over. `parse` still rejects below API 35, so this
   * only ever comes back empty on an API 35+ device.
   */
  text: string;
  /** Absolute path of the rendered page PNG in the app cache. */
  imagePath: string;
}

export interface PdfNovel {
  /** Document title, or '' when the document carries none. */
  title: string;
  /** Document author, or '' when the document carries none. */
  author: string;
  /** Absolute path of the first page render, used as the novel cover. */
  cover: string | null;
  pages: PdfPage[];
}

export interface Spec extends TurboModule {
  /**
   * Rasterize every page of `pdfFilePath` into `outputDirPath` and return the
   * per-page text layer together with the absolute path of each rendered PNG.
   *
   * Rejects when the file is not a readable, unencrypted PDF, or when the
   * device is below Android 15 (API 35), which is where the framework first
   * exposes a PDF text layer.
   */
  parse: (pdfFilePath: string, outputDirPath: string) => Promise<PdfNovel>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePdf');
