import { runInNewContext } from 'vm';

import {
  applyTermsToHtml,
  buildApplyTermsJs,
  ReaderTerm,
  termMatchSignature,
} from '../readerTerms';

const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string) => { window: any };
};

type Dom = { window: any };

const makeDom = (html: string): Dom => new JSDOM(html);

/** Execute the generated injection against a detached jsdom document. */
const applyInDom = (dom: Dom, terms: ReaderTerm[]): void => {
  runInNewContext(buildApplyTermsJs(terms), {
    document: dom.window.document,
    NodeFilter: dom.window.NodeFilter,
  });
};

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

const TWO_BLOCKS = `<!doctype html><html><body>
  <div id="SoraReader-chapter" class="sorareader-chapter-block" data-chapter-id="1"><p>Halo Dunia</p></div>
  <div id="ch-2" class="sorareader-chapter-block" data-chapter-id="2"><p>Halo Dunia</p></div>
</body></html>`;

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

describe('term signature markers', () => {
  it('stamps a stable signature into statically generated spans', () => {
    const out = applyTermsToHtml('<p>Halo Dunia</p>', [styled]);
    expect(out).toContain(termMatchSignature('Dunia', styled));
    expect(out).toContain('data-lnr-sig=');
  });

  it('recognizes statically generated spans as already applied', () => {
    const processed = applyTermsToHtml('<p>Halo Dunia</p>', [styled]);
    const dom = makeDom(
      `<!doctype html><html><body><div id="SoraReader-chapter" class="sorareader-chapter-block">${processed}</div></body></html>`,
    );
    const before = dom.window.document.body.innerHTML;
    applyInDom(dom, [styled]);
    expect(dom.window.document.querySelectorAll('.lnr-term')).toHaveLength(1);
    expect(dom.window.document.body.innerHTML).toBe(before);
  });
});

describe('buildApplyTermsJs', () => {
  it('targets every chapter block, not just #SoraReader-chapter', () => {
    expect(buildApplyTermsJs([styled])).toContain(
      "querySelectorAll('.sorareader-chapter-block",
    );

    const dom = makeDom(TWO_BLOCKS);
    applyInDom(dom, [styled]);
    const blocks = dom.window.document.querySelectorAll(
      '.sorareader-chapter-block',
    );
    expect(blocks).toHaveLength(2);
    blocks.forEach((block: any) => {
      expect(block.querySelectorAll('.lnr-term')).toHaveLength(1);
    });
  });

  it('is idempotent: applying twice keeps the same span count and DOM', () => {
    const dom = makeDom(TWO_BLOCKS);
    applyInDom(dom, [styled]);
    const firstMarkup = dom.window.document.body.innerHTML;
    expect(dom.window.document.querySelectorAll('.lnr-term')).toHaveLength(2);

    applyInDom(dom, [styled]);
    expect(dom.window.document.querySelectorAll('.lnr-term')).toHaveLength(2);
    expect(dom.window.document.body.innerHTML).toBe(firstMarkup);
  });

  it('contains no original-text flash marker / blanket revert-and-rebuild', () => {
    const js = buildApplyTermsJs([styled]);
    expect(js).not.toContain('createTextNode');
    expect(js).not.toContain('.normalize()');
    expect(js).toContain('data-lnr-sig');
  });

  it('never rewrites an already matching span on a second apply', () => {
    const dom = makeDom(TWO_BLOCKS);
    applyInDom(dom, [styled]);
    const replaceWith = jest.spyOn(
      dom.window.Element.prototype,
      'replaceWith',
    );
    applyInDom(dom, [styled]);
    expect(replaceWith).not.toHaveBeenCalled();
  });

  it('updates an edited term in place instead of flashing the original text', () => {
    const dom = makeDom(TWO_BLOCKS);
    applyInDom(dom, [styled]);
    const before = Array.from(
      dom.window.document.querySelectorAll('.lnr-term'),
    );

    applyInDom(dom, [{ ...styled, to: 'World!', style: { italic: true } }]);

    const after = Array.from(
      dom.window.document.querySelectorAll('.lnr-term'),
    );
    expect(after).toHaveLength(2);
    after.forEach((span: any, i: number) => {
      // Same element nodes were reused (patched), never detached/rebuilt.
      expect(span).toBe(before[i]);
      expect(span.innerHTML).toBe('<em>World!</em>');
      expect(span.getAttribute('data-from')).toBe('Dunia');
    });
  });

  it('upgrades legacy signature-less spans without detaching them', () => {
    const dom = makeDom(
      `<!doctype html><html><body>
        <div id="SoraReader-chapter" class="sorareader-chapter-block">
          <p>Halo <span class="lnr-term" data-from="Dunia" data-to="World" data-scope="global"><strong>World</strong></span></p>
        </div>
      </body></html>`,
    );
    const legacy = dom.window.document.querySelector('.lnr-term');
    const createTextNode = jest.spyOn(dom.window.document, 'createTextNode');

    applyInDom(dom, [styled]);

    expect(dom.window.document.querySelectorAll('.lnr-term')).toHaveLength(1);
    expect(dom.window.document.querySelector('.lnr-term')).toBe(legacy);
    expect(legacy.getAttribute('data-lnr-sig')).toBe(
      termMatchSignature('Dunia', styled),
    );
    expect(createTextNode).not.toHaveBeenCalled();
  });
});
