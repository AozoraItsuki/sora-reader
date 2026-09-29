import type { DocumentPickerAsset } from 'expo-document-picker';

import { isPdfAsset, routeImportAssets } from '../localImport';

const asset = (name: string, uri: string): DocumentPickerAsset =>
  ({ name, uri, size: 1, mimeType: undefined } as DocumentPickerAsset);

describe('isPdfAsset', () => {
  it('recognises a pdf by its extension', () => {
    expect(isPdfAsset(asset('Book.PDF', 'content://a/Book.PDF'))).toBe(true);
  });

  it('recognises a pdf from the uri when the name has no extension', () => {
    expect(isPdfAsset(asset('download', 'content://a/book.pdf'))).toBe(true);
  });

  it('treats an epub as not a pdf', () => {
    expect(isPdfAsset(asset('Book.epub', 'content://a/Book.epub'))).toBe(false);
  });
});

describe('routeImportAssets', () => {
  it('splits a mixed pick into the two importers by extension', () => {
    const epub = asset('Novel.epub', 'content://a/Novel.epub');
    const pdf = asset('Comic.pdf', 'content://a/Comic.pdf');

    const routes = routeImportAssets([epub, pdf, epub, pdf]);

    expect(routes.epub).toEqual([epub, epub]);
    expect(routes.pdf).toEqual([pdf, pdf]);
  });

  it('keeps a query string or fragment from hiding the extension', () => {
    const pdf = asset('export.pdf?dl=1', 'content://a/export.pdf?dl=1');

    expect(routeImportAssets([pdf]).pdf).toEqual([pdf]);
  });

  it('drops a file the app cannot import instead of guessing', () => {
    const routes = routeImportAssets([
      asset('Notes.txt', 'content://a/Notes.txt'),
      asset('Book.epub', 'content://a/Book.epub'),
    ]);

    expect(routes.epub).toHaveLength(1);
    expect(routes.pdf).toEqual([]);
  });

  it('returns empty routes for an empty pick', () => {
    expect(routeImportAssets([])).toEqual({ epub: [], pdf: [] });
  });
});
