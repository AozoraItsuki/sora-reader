import { saveDocuments } from '@react-native-documents/picker';
import * as Print from 'expo-print';

import PdfBuilder from '../PdfBuilder';

// `expo-print` ships no jest preset; the module is mocked virtually so this
// suite runs before the native package is installed.
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }), {
  virtual: true,
});

jest.mock('@react-native-documents/picker', () => ({
  saveDocuments: jest.fn(),
}));

const printToFileAsync = Print.printToFileAsync as jest.MockedFunction<
  typeof Print.printToFileAsync
>;
const saveDocumentsMock = saveDocuments as jest.MockedFunction<
  typeof saveDocuments
>;

// `expo-print` renders into `<cacheDir>/Print/<uuid>.pdf` and hands back a
// `file://` uri, which is exactly what `saveDocuments` expects as its source.
const PRINTED_URI = 'file:///data/user/0/sorareader/cache/Print/printed.pdf';

const newBuilder = (fileName = 'Re:Zero') =>
  new PdfBuilder({ title: 'Re:Zero', fileName });

const preparedBuilder = async () => {
  const builder = await newBuilder().prepare();
  builder.addChapter({ title: 'Chapter 1', htmlBody: '<p>First.</p>' });
  return builder;
};

beforeEach(() => {
  printToFileAsync.mockResolvedValue({
    uri: PRINTED_URI,
    numberOfPages: 12,
  });
  saveDocumentsMock.mockResolvedValue([
    { uri: 'content://saved/1', name: 'Re:Zero.pdf', error: null },
  ]);
});

describe('PdfBuilder.addChapter', () => {
  it('rejects a chapter when prepare was not called', () => {
    // Given a builder that was never prepared
    // When a chapter is added
    // Then it throws instead of collecting chapters into a document that
    // save() would happily print without them
    expect(() =>
      newBuilder().addChapter({ title: 'Chapter 1', htmlBody: '<p>First.</p>' }),
    ).toThrow('Please run the prepare method first');
  });

  it('counts the chapters collected for the current document', async () => {
    // Given a prepared builder with one chapter
    const builder = await preparedBuilder();
    // When the chapter count is read
    // Then it reports the collected chapter
    expect(builder.chapterCount).toBe(1);
  });
});

describe('PdfBuilder.buildHtml', () => {
  it('renders every added chapter in order', async () => {
    // Given a prepared builder holding two chapters
    const builder = await newBuilder().prepare();
    builder.addChapter({ title: 'Arc 1', htmlBody: '<p>One.</p>' });
    builder.addChapter({ title: 'Arc 2', htmlBody: '<p>Two.</p>' });
    // When the print document is assembled
    const html = builder.buildHtml();
    // Then both chapters appear, in the order they were added
    expect(html.indexOf('<p>One.</p>')).toBeLessThan(html.indexOf('<p>Two.</p>'));
  });

  it('breaks the page before every chapter except the first', async () => {
    // Given a prepared builder holding two chapters
    const builder = await newBuilder().prepare();
    builder.addChapter({ title: 'Arc 1', htmlBody: '<p>One.</p>' });
    builder.addChapter({ title: 'Arc 2', htmlBody: '<p>Two.</p>' });
    // When the print document is assembled
    const html = builder.buildHtml();
    // Then only the chapter right after the title block keeps the page break
    // off, so the export does not start with a blank page
    expect(html).toContain('<section class="pdf-chapter pdf-chapter-first">');
    expect(html.match(/<section class="pdf-chapter">/g)).toHaveLength(1);
  });

  it('escapes novel and chapter titles', async () => {
    // Given a builder whose title carries HTML metacharacters
    const builder = new PdfBuilder({
      title: 'Tom & Jerry <b>',
      fileName: 'Jerry',
    });
    await builder.prepare();
    builder.addChapter({ title: 'A <script>alert(1)</script>', htmlBody: '' });
    // When the print document is assembled
    const html = builder.buildHtml();
    // Then the titles are inert text
    expect(html).toContain('Tom &amp; Jerry &lt;b&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('PdfBuilder.save', () => {
  it('prints the assembled document to a file', async () => {
    // Given a prepared builder holding a chapter
    const builder = await preparedBuilder();
    // When the document is saved
    await builder.save();
    // Then the print engine received the assembled HTML
    expect(printToFileAsync).toHaveBeenCalledTimes(1);
    expect(printToFileAsync).toHaveBeenCalledWith({
      html: expect.stringContaining('<p>First.</p>'),
    });
  });

  it('copies the printed file to the destination the user picks', async () => {
    // Given a prepared builder holding a chapter
    const builder = await preparedBuilder();
    // When the document is saved
    await builder.save();
    // Then the save dialog is seeded with the printed file and a .pdf name
    expect(saveDocumentsMock).toHaveBeenCalledWith({
      sourceUris: [PRINTED_URI],
      copy: false,
      mimeType: 'application/pdf',
      fileName: 'ReZero.pdf',
    });
  });

  it('returns the cache uri, page count and saved file name', async () => {
    // Given a print engine that produced a twelve page document
    const builder = await preparedBuilder();
    // When the document is saved
    const result = await builder.save();
    // Then the caller learns where the file is and how long it is
    expect(result).toEqual({
      uri: PRINTED_URI,
      numberOfPages: 12,
      fileName: 'ReZero.pdf',
    });
  });

  it('surfaces an abandoned save dialog to the caller', async () => {
    // Given a save dialog the user closed without choosing a destination
    saveDocumentsMock.mockRejectedValue(new Error('Save cancelled'));
    const builder = await preparedBuilder();
    // When the document is saved
    // Then the rejection reaches the caller instead of reporting success
    await expect(builder.save()).rejects.toThrow('Save cancelled');
  });
});

describe('PdfBuilder.discardChanges', () => {
  it('drops the collected chapters', async () => {
    // Given a prepared builder holding a chapter
    const builder = await preparedBuilder();
    // When the changes are discarded
    await builder.discardChanges();
    // Then the builder holds nothing and is no longer prepared
    expect(builder.chapterCount).toBe(0);
    expect(() =>
      builder.addChapter({ title: 'Arc 3', htmlBody: '<p>Three.</p>' }),
    ).toThrow('Please run the prepare method first');
  });
});
