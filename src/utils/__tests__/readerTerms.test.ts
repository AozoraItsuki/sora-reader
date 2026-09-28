import { applyTermsToHtml, ReaderTerm } from '../readerTerms';

const unstyled: ReaderTerm = {
  id: 't1',
  from: 'Halo',
  to: 'Hai',
  scope: 'global',
  caseSensitive: false,
};

const styled: ReaderTerm = {
  id: 't2',
  from: 'Dunia',
  to: 'World',
  scope: 'global',
  caseSensitive: false,
  style: { bold: true },
};

describe('readerTerms unstyled terms', () => {
  it('replaces text without emitting a marker span when the term has no style', () => {
    const out = applyTermsToHtml('<p>Halo Dunia</p>', [unstyled]);
    expect(out).toContain('Hai');
    expect(out).not.toContain('Halo');
    expect(out).not.toContain('lnr-term');
  });

  it('still wraps styled terms in a marker span', () => {
    const out = applyTermsToHtml('<p>Halo Dunia</p>', [styled]);
    expect(out).toContain('lnr-term');
    expect(out).toContain('World');
  });

  it('treats an explicitly empty style object as unstyled', () => {
    const out = applyTermsToHtml('<p>Halo</p>', [{ ...unstyled, style: {} }]);
    expect(out).toContain('Hai');
    expect(out).not.toContain('lnr-term');
  });
});
