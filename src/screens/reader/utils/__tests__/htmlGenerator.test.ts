import {
  initialChapterGeneralSettings,
  initialChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import type { ThemeColors } from '@theme/types';
import fs from 'fs';
import path from 'path';
import { StatusBar } from 'react-native';
import vm from 'vm';

import {
  buildAppendStatusCall,
  buildClearAppendStatusCall,
  generateAppendChapterHtml,
  generateReaderHtml,
  HtmlTemplateOptions,
  READER_LAYOUT_TOKENS,
} from '../htmlGenerator';

const theme: ThemeColors = {
  id: 0,
  name: 'test',
  isDark: true,
  primary: '#6750a4',
  onPrimary: '#ffffff',
  primaryContainer: '#eaddff',
  onPrimaryContainer: '#21005d',
  secondary: '#625b71',
  onSecondary: '#ffffff',
  secondaryContainer: '#e8def8',
  onSecondaryContainer: '#1d192b',
  tertiary: '#7d5260',
  onTertiary: '#ffffff',
  tertiaryContainer: '#ffd8e4',
  onTertiaryContainer: '#31111d',
  error: '#b3261e',
  onError: '#ffffff',
  errorContainer: '#f9dedc',
  onErrorContainer: '#410e0b',
  background: '#fef7ff',
  onBackground: '#1d1b20',
  surface: '#fef7ff',
  onSurface: '#1d1b20',
  surfaceVariant: '#e7e0ec',
  onSurfaceVariant: '#49454f',
  outline: '#79747e',
  outlineVariant: '#cac4d0',
  shadow: '#000000',
  scrim: '#000000',
  inverseSurface: '#322f35',
  inverseOnSurface: '#f5eff7',
  inversePrimary: '#d0bcff',
  surfaceDisabled: '#1d1b2020',
  onSurfaceDisabled: '#1d1b2038',
  backdrop: '#322f35',
  rippleColor: '#322f35',
};

const baseOptions: HtmlTemplateOptions = {
  html: '<p>chapter body</p>',
  theme,
  readerSettings: initialChapterReaderSettings,
  chapterGeneralSettings: initialChapterGeneralSettings,
  novel: { id: 1 },
  chapter: { id: 2, name: 'Chapter 1' },
  assetsUriPrefix: 'file:///android_asset',
  batteryLevel: 50,
  strings: {
    finished: 'Finished',
    nextChapter: 'Next',
    noNextChapter: 'No next chapter',
  },
};

const readCssVar = (html: string, name: string) =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(html)?.[1].trim();

describe('generateReaderHtml safe-area insets', () => {
  it('falls back to the legacy status bar height when no top inset is injected', () => {
    // Given: a caller that predates the injected inset
    // When: the template is generated without readerTopInset
    const html = generateReaderHtml(baseOptions);

    // Then: the top offset keeps its previous status-bar value
    expect(readCssVar(html, '--reader-topInset')).toBe(
      `${StatusBar.currentHeight ?? 0}px`,
    );
  });

  it('drives the top offset from the injected safe-area inset', () => {
    // Given: an injected inset that differs from the legacy fallback
    // When: the template is generated with it
    const html = generateReaderHtml({ ...baseOptions, readerTopInset: 48 });

    // Then: the top offset is the injected value, not the status bar height
    expect(readCssVar(html, '--reader-topInset')).toBe('48px');
  });

  it('exposes each safe-area edge through its own variable', () => {
    // Given: a fullscreen reader where the system bars are hidden
    // When: the template is generated with both insets collapsed
    const html = generateReaderHtml({
      ...baseOptions,
      readerTopInset: 24,
      readerBottomInset: 0,
    });

    // Then: the bottom offset stays collapsed and the top offset is injected
    expect(readCssVar(html, '--reader-bottomInset')).toBe('0px');
    expect(readCssVar(html, '--reader-topInset')).toBe('24px');
  });
});

describe('generateReaderHtml reading layout', () => {
  it('publishes the layout tokens as custom properties', () => {
    // Given: any reader theme
    // When: the document is generated
    const html = generateReaderHtml(baseOptions);

    // Then: the narrow measure and the paragraph rhythm are addressable from
    // the stylesheet instead of being hardcoded per rule
    expect(readCssVar(html, '--reader-columnMax')).toBe(
      READER_LAYOUT_TOKENS.columnMax,
    );
    expect(readCssVar(html, '--reader-paragraphGap')).toBe(
      READER_LAYOUT_TOKENS.paragraphGap,
    );
    expect(readCssVar(html, '--reader-headingGap')).toBe(
      READER_LAYOUT_TOKENS.headingGap,
    );
    expect(readCssVar(html, '--reader-radius')).toBe(
      READER_LAYOUT_TOKENS.radius,
    );
  });

  it('centers the content in a narrow column and opts paged mode out', () => {
    const html = generateReaderHtml(baseOptions);

    // The column is capped and centered for the continuous reader...
    expect(html).toContain('max-width: var(--reader-columnMax)');
    expect(html).toContain('margin-left: auto');
    // ...and only there: paged mode owns its own column geometry, so capping
    // it would clip every page frame.
    expect(html).toContain('body:not(.page-reader) .sorareader-chapter-block');
  });

  it('gives paragraphs an even vertical rhythm and collapses scraped br runs', () => {
    const html = generateReaderHtml(baseOptions);

    expect(html).toContain('margin: 0 0 var(--reader-paragraphGap);');
    // A <br><br> paragraph separator on top of the margin would double the gap,
    // so the run collapses and the rhythm stays the same for every chapter.
    expect(html).toContain(
      'body:not(.page-reader) .sorareader-chapter-block br + br',
    );
    expect(html).toContain('display: none;');
  });

  it('keeps the three term-mark variants on distinct theme roles', () => {
    const html = generateReaderHtml(baseOptions);

    // User terms fall back to the app primary (the wtr-lab term blue), and a
    // user-picked color still arrives as an inline style on top of that.
    expect(readCssVar(html, '--reader-termUser')).toBe(theme.primary);
    expect(html).toContain('.lnr-term {');
    // System and patch marks must not collapse onto the user color. Patch
    // terms keep the reference reader's green, picked per color scheme.
    expect(readCssVar(html, '--reader-termSystem')).toBe(theme.tertiary);
    expect(readCssVar(html, '--reader-termPatch')).toBe(
      theme.isDark ? '#8fd694' : '#2e7d32',
    );
    expect(html).toContain(".lnr-term[data-kind='system']");
    expect(html).toContain(".lnr-term[data-kind='patch']");
    // The color rules match any element, so the reader's own marks have to
    // carry the kind for the system/patch colors to be reachable at all.
    expect(html).toContain("[data-kind='system'] {");
    expect(html).toContain("[data-kind='patch'] {");
    expect(html).toContain('id="SoraReader-title-novel" data-kind="system"');
    expect(
      generateAppendChapterHtml({
        html: '<p>x</p>',
        chapterId: 9,
        chapterName: 'next',
      }),
    ).toContain('class="chapter-append-divider" data-kind="patch"');
  });

  it('styles code with families the WebView already has', () => {
    const html = generateReaderHtml(baseOptions);

    expect(html).toContain('monospace');
    // No font dependency may be introduced for the code treatment: the reader
    // font face is still the only one the document declares.
    const declaredFonts = html.match(/android_asset\/fonts\//g) ?? [];
    expect(declaredFonts).toHaveLength(1);
  });

  it('renders the always-visible progress rail and its driver', () => {
    const html = generateReaderHtml(baseOptions);

    expect(html).toContain('id="reader-progress-bar"');
    expect(html).toContain('id="reader-append-status-slot"');
    expect(html).toContain('scheduleProgressBar');
    // Re-arming is what lets a failed append be retried instead of
    // dead-ending the scroll for the session.
    expect(html).toContain('window.reader.rearmNearBottom');
    expect(html).toContain('window.reader.showAppendStatus');
    expect(html).toContain('window.reader.clearAppendStatus');
  });

  it('keeps illustrations and PDF image chapters intact', () => {
    // Given: a PDF chapter that is nothing but page images
    const pdfHtml =
      '<img class="pdf-page-image" src="0.b64.png"><img class="pdf-page-image" src="1.b64.png">';

    // When
    const html = generateReaderHtml({ ...baseOptions, html: pdfHtml });

    // Then: the image markup is passed through untouched and still scales
    expect(html).toContain(pdfHtml);
    expect(html).toContain('max-width: 100%');
  });

  it('escapes plugin chapter names before they reach the markup', () => {
    const html = generateReaderHtml({
      ...baseOptions,
      chapter: { id: 2, name: '<img src=x onerror=alert(1)>' },
    });

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('emits inline scripts that actually parse', () => {
    // The document is assembled as one template literal, so a stray backtick or
    // an unbalanced brace only shows up as a syntax error inside the WebView.
    const html = generateReaderHtml(baseOptions);
    const inlineScripts = [
      ...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
    ].map(match => match[1]);

    expect(inlineScripts.length).toBeGreaterThan(0);
    for (const body of inlineScripts) {
      expect(() => new vm.Script(body)).not.toThrow();
    }
  });
});

describe('generateAppendChapterHtml', () => {
  it('keeps the identity core.js walks progress by', () => {
    // Given: the next chapter resolved to real content
    // When: its block markup is built for the append
    const block = generateAppendChapterHtml({
      html: '<p>body</p>',
      chapterId: 42,
      chapterName: 'Chapter 42',
    });

    // Then: the class + data attribute core.js queries for are unchanged, so an
    // appended chapter keeps receiving progress saves
    expect(block).toContain('class="sorareader-chapter-block"');
    expect(block).toContain('data-chapter-id="42"');
    expect(block).toContain('id="ch-42"');
    expect(block).toContain(
      '<div class="chapter-append-divider" data-kind="patch">',
    );
    expect(block).toContain('<p>body</p>');
  });

  it('escapes the chapter name it prints in the divider', () => {
    const block = generateAppendChapterHtml({
      html: '<p>body</p>',
      chapterId: 7,
      chapterName: 'Vol <2>',
    });

    expect(block).toContain('Vol &lt;2&gt;');
    expect(block).not.toContain('Vol <2>');
  });
});

describe('buildAppendStatusCall', () => {
  it('passes the chapter as data so a plugin title cannot inject markup', () => {
    const call = buildAppendStatusCall(
      9,
      '</script><img src=x onerror=alert(1)>',
      'empty',
    );

    expect(call).toContain('window.reader.showAppendStatus');
    // Only the kinds the document understands are ever emitted.
    expect(call).toContain('"empty"');
    expect(buildAppendStatusCall(9, 'n', 'error')).toContain('"error"');
    // The payload is a JS string, so a closing tag cannot break out of it.
    expect(call).not.toContain('</script>');
  });

  it('clears the marker by chapter id', () => {
    expect(buildClearAppendStatusCall(9)).toContain(
      'window.reader.clearAppendStatus(9)',
    );
  });
});

describe('reader stylesheet assets', () => {
  const assetRoot = path.resolve(
    __dirname,
    '../../../../../android/app/src/main/assets',
  );
  const read = (file: string) =>
    fs.readFileSync(path.join(assetRoot, file), 'utf8');

  it('owns the progress rail and the append marker outside the generated doc', () => {
    const css = read('css/index.css');

    expect(css).toContain('#reader-progress-bar');
    expect(css).toContain('transform: scaleX(0)');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('.sorareader-append-status');
    // The marker must never look like a chapter block, or core.js would
    // attribute read progress to a chapter that never loaded.
    expect(css).not.toMatch(
      /\.sorareader-append-status\b[^{]*\{[^}]*chapter-block/,
    );
    // The capped column has to keep its gutter inside the measure.
    expect(css).toContain('box-sizing: border-box');
  });

  it('keeps the safe-area offsets and dvh paging math untouched', () => {
    const css = read('css/index.css');
    const pageCss = read('css/pageReader.css');

    expect(css).toContain('var(--reader-topInset, 0px)');
    expect(css).toContain('var(--reader-bottomInset, 0px)');
    // The footer reservation is still resolved from the body-wide variable, and
    // paged mode still subtracts all three offsets from the real dvh.
    expect(css).toContain('--reader-footerInset');
    expect(pageCss).toContain('100dvh');
    expect(pageCss).toContain('--reader-footerInset');
    expect(pageCss).toContain('--reader-topInset');
  });

  it('exempts paged mode from the narrow column', () => {
    const pageCss = read('css/pageReader.css');

    expect(pageCss).toContain('max-width: none');
    expect(pageCss).toContain('body.page-reader .sorareader-chapter-block');
  });
});
