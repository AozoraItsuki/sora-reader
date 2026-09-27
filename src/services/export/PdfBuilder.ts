import { saveDocuments } from '@react-native-documents/picker';
import * as Print from 'expo-print';

export interface PdfSettings {
  title: string;
  fileName: string;
  author?: string;
  /** Reader styling applied on top of the print stylesheet. */
  stylesheet?: string;
}

export interface PdfChapter {
  title: string;
  htmlBody: string;
}

export interface PdfSaveResult {
  /** `file://` uri of the rendered PDF inside the app cache directory. */
  uri: string;
  numberOfPages: number;
  fileName: string;
}

/** Characters the save dialog's file name cannot carry. */
const ILLEGAL_FILE_NAME_CHARS = /[\\/:*?"<>|]/g;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

const escapeHtmlText = (value: string): string =>
  value.replace(/[&<>]/g, char => HTML_ESCAPES[char] ?? char);

/**
 * Print stylesheet. `@page` is the only margin control Android honours
 * (expo-print asks the print framework for zero margins), and every chapter
 * but the first starts on a fresh page.
 */
const PRINT_CSS = `
  @page { margin: 18mm 14mm; }
  html, body { margin: 0; padding: 0; }
  body { font-family: serif; line-height: 1.6; color: #111; }
  .pdf-title { font-size: 24pt; margin-bottom: 6pt; }
  .pdf-author { font-size: 12pt; color: #555; margin-top: 0; }
  .pdf-chapter { page-break-before: always; }
  .pdf-chapter-first { page-break-before: avoid; }
  .pdf-chapter-title { font-size: 16pt; }
  img { display: block; max-width: 100%; height: auto; }
`;

export const getPdfFileName = (fileName: string): string =>
  `${fileName.replace(ILLEGAL_FILE_NAME_CHARS, '').trim() || 'novel'}.pdf`;

/**
 * Assembles novel chapters into a single print-ready HTML document and hands
 * the rendered PDF to the system save dialog.
 *
 * Mirrors `EpubBuilder`: chapters are collected between `prepare()` and
 * `save()`, and `discardChanges()` drops whatever was collected.
 */
export default class PdfBuilder {
  private settings: PdfSettings;
  private chapters: PdfChapter[] = [];
  private prepared: boolean = false;

  constructor(settings: PdfSettings) {
    this.settings = settings;
  }

  public getPdfSettings(): PdfSettings {
    return this.settings;
  }

  public get chapterCount(): number {
    return this.chapters.length;
  }

  /** Start a fresh document, dropping anything collected before. */
  public async prepare(): Promise<this> {
    this.prepared = true;
    this.chapters = [];
    return this;
  }

  public async discardChanges(): Promise<void> {
    this.chapters = [];
    this.prepared = false;
  }

  public addChapter(chapter: PdfChapter): void {
    if (!this.prepared) {
      throw new Error('Please run the prepare method first');
    }
    this.chapters.push(chapter);
  }

  /** The full document handed to the print engine. */
  public buildHtml(): string {
    const stylesheet = this.settings.stylesheet
      ? `<style>${this.settings.stylesheet}</style>`
      : '';
    const author = this.settings.author
      ? `<p class="pdf-author">${escapeHtmlText(this.settings.author)}</p>`
      : '';
    const titleBlock = `<header><h1 class="pdf-title">${escapeHtmlText(
      this.settings.title,
    )}</h1>${author}</header>`;
    const body = this.chapters
      .map(
        (chapter, index) =>
          `<section class="pdf-chapter${index === 0 ? ' pdf-chapter-first' : ''}">` +
          `<h2 class="pdf-chapter-title">${escapeHtmlText(chapter.title)}</h2>` +
          `${chapter.htmlBody}</section>`,
      )
      .join('');

    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8" />' +
      `<title>${escapeHtmlText(this.settings.title)}</title>` +
      `<style>${PRINT_CSS}</style>${stylesheet}</head>` +
      `<body>${titleBlock}${body}</body></html>`
    );
  }

  /**
   * Render the document and let the user pick where it is stored.
   *
   * `printToFileAsync` writes into the app cache directory and returns a
   * `file://` uri, which is then copied to the SAF destination the user chose.
   */
  public async save(): Promise<PdfSaveResult> {
    const fileName = getPdfFileName(this.settings.fileName);
    const { uri, numberOfPages } = await Print.printToFileAsync({
      html: this.buildHtml(),
    });

    await saveDocuments({
      sourceUris: [uri],
      copy: false,
      mimeType: 'application/pdf',
      fileName,
    });

    await this.discardChanges();

    return { uri, numberOfPages, fileName };
  }
}
