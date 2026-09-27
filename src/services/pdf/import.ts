/**
 * PDF import: one chapter per PDF page.
 *
 * A PDF has no document structure the reader understands, so the native side
 * ([NativePdf]) rasterizes every page into the app cache and returns the page
 * text layer alongside it. This module then writes the result into the SAF
 * download tree in exactly the same shape the EPUB importer produces, so
 * nothing downstream knows which format the novel came from.
 */
import { LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import {
  batchInsertChapters,
  importAssetIntoTree,
  insertLocalNovel,
  pathBasename,
} from '@services/local/importShared';
import { safMkdir, safWriteFile } from '@services/saf/safFile';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import NativeFile from '@specs/NativeFile';
import NativePdf from '@specs/NativePdf';
import { getString } from '@strings/translations';
import {
  chapterImageRel,
  chapterIndexRel,
  chapterRel,
} from '@utils/DownloadPaths';
import dayjs from 'dayjs';

/**
 * Ordinal of the page image inside its chapter folder. A chapter holds exactly
 * one image, and 0 keeps it on the same naming scheme the downloader uses.
 */
const PAGE_IMAGE_INDEX = 0;

/** `Novels/{pluginId}/{novelId}/{chapterId}/0.b64.png` */
const pageImageRelPath = (novelId: number, chapterId: number): string =>
  chapterImageRel(LOCAL_PLUGIN_ID, novelId, chapterId, PAGE_IMAGE_INDEX);

/** The page text is untrusted document content, so it is escaped, never raw. */
const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * One chapter document: the page's text layer above its render.
 *
 * The image is referenced by bare filename because `LocalPlugin.resolveUrl`
 * anchors a relative src to the chapter's own directory on the local server,
 * which is exactly where the image is written.
 */
const buildChapterHtml = (text: string, imageName: string): string => {
  const textBlock = text.trim()
    ? `<div class="pdf-page-text">${escapeHtml(text).replace(
        /\r?\n/g,
        '<br/>',
      )}</div>`
    : '';
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    `</head><body>${textBlock}` +
    `<img class="pdf-page-image" src="${imageName}"/>` +
    '</body></html>'
  );
};

/** `book.pdf` -> `book`; the fallback title for a PDF with no document title. */
const titleFromFilename = (filename: string): string =>
  filename.replace(/\.pdf$/i, '') || 'Untitled';

export const importPdf = async (
  {
    uri,
    filename,
  }: {
    uri: string;
    filename: string;
  },
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
    progress: 0,
  }));

  const cacheDir = NativeFile.getConstants().ExternalCachesDirectoryPath;
  const pdfFilePath = `${cacheDir}/novel.pdf`;
  try {
    NativeFile.copyFile(uri, pdfFilePath);
  } catch {
    throw new Error(
      `Failed to read PDF file "${filename}". The file may have been moved or deleted. Please try importing again.`,
    );
  }

  // Rendered pages are scratch space: drop whatever the previous import left
  // behind so a shorter PDF cannot reuse stale page images.
  const pdfDirPath = `${cacheDir}/pdf`;
  if (NativeFile.exists(pdfDirPath)) {
    NativeFile.unlink(pdfDirPath);
  }
  NativeFile.mkdir(pdfDirPath);

  const pdf = await NativePdf.parse(pdfFilePath, pdfDirPath);
  const novelId = await insertLocalNovel({
    name: pdf.title || titleFromFilename(filename),
    // temporary
    path: pdfFilePath,
    cover: pdf.cover || '',
    author: pdf.author || '',
  });

  setMeta(meta => ({
    ...meta,
    progressText: getString('common.preparing'),
  }));

  // Phase 1: single transaction -- one chapter row per page.
  const chapterResults = await batchInsertChapters(
    novelId,
    pdf.pages.map(page => ({
      name: `Page ${page.pageNumber}`,
      path: page.imagePath,
    })),
    dayjs().toISOString(),
  );

  // Phase 2: file I/O outside the transaction.
  for (let i = 0; i < chapterResults.length; i++) {
    const result = chapterResults[i];
    const page = pdf.pages[result.fakeId];
    if (!page) {
      continue;
    }

    setMeta(meta => ({
      ...meta,
      progressText: `Page ${page.pageNumber}`,
      progress: i / chapterResults.length,
    }));

    const chapterRelDir = chapterRel(LOCAL_PLUGIN_ID, novelId, result.insertId);
    const imageRelPath = pageImageRelPath(novelId, result.insertId);
    await safMkdir(chapterRelDir);
    await safWriteFile(
      chapterIndexRel(LOCAL_PLUGIN_ID, novelId, result.insertId),
      buildChapterHtml(page.text, pathBasename(imageRelPath)),
    );
    await importAssetIntoTree(result.sourcePath, imageRelPath);
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
  }));
};
