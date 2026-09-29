/**
 * Routing for the "import from local files" picker.
 *
 * One picker accepts both supported formats, but each importer is a different
 * background task, so the pick has to be split by file extension before it is
 * queued. Anything else is dropped rather than guessed at: a file we cannot read
 * is a no-op, and a wrong guess would leave a half-imported novel behind.
 */
import type { DocumentPickerAsset } from 'expo-document-picker';

export const EPUB_MIME = 'application/epub+zip';
export const PDF_MIME = 'application/pdf';

export interface LocalImportRoutes {
  epub: DocumentPickerAsset[];
  pdf: DocumentPickerAsset[];
}

/** Lowercased extension of a picked file, without the dot. */
export const fileExtension = (name: string): string => {
  // Picked names occasionally carry a query string, which would otherwise
  // become part of the "extension".
  const clean = name.split(/[?#]/)[0] ?? '';
  const dot = clean.lastIndexOf('.');
  return dot < 0 ? '' : clean.slice(dot + 1).toLowerCase();
};

const extensionOf = (asset: Pick<DocumentPickerAsset, 'name' | 'uri'>) =>
  fileExtension(asset.name) || fileExtension(asset.uri ?? '');

/** `true` when the pick should go to the PDF importer. */
export const isPdfAsset = (
  asset: Pick<DocumentPickerAsset, 'name' | 'uri'>,
): boolean => extensionOf(asset) === 'pdf';

/** `true` when the pick should go to the EPUB importer. */
export const isEpubAsset = (
  asset: Pick<DocumentPickerAsset, 'name' | 'uri'>,
): boolean => extensionOf(asset) === 'epub';

/** Split a mixed pick into the assets each importer should receive. */
export const routeImportAssets = (
  assets: DocumentPickerAsset[],
): LocalImportRoutes => ({
  epub: assets.filter(isEpubAsset),
  pdf: assets.filter(isPdfAsset),
});
