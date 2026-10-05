import { ChapterInfo, NovelInfo } from '@database/types';
import {
  ChapterGeneralSettings,
  ChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import { ThemeColors } from '@theme/types';
import color from 'color';
import { StatusBar } from 'react-native';

export interface HtmlTemplateOptions {
  html: string;
  theme: ThemeColors;
  readerSettings: ChapterReaderSettings;
  chapterGeneralSettings: ChapterGeneralSettings;
  novel: Partial<NovelInfo>;
  chapter: Partial<ChapterInfo>;
  nextChapter?: Partial<ChapterInfo>;
  prevChapter?: Partial<ChapterInfo>;
  assetsUriPrefix: string;
  batteryLevel: number | null;
  readerBottomInset?: number;
  /**
   * Safe-area top inset in px. Defaults to the status bar height so callers
   * that predate the injection keep their previous top offset.
   */
  readerTopInset?: number;
  pluginCustomCSS?: string;
  pluginCustomJS?: string;
  nextChapterScreenVisible?: boolean;
  pendingScrollPosition?: 'start' | 'end' | number | null;
  readerDir?: 'rtl' | 'ltr';
  getLocalServerUrl?: () => string;
  isSettingsPreview?: boolean;
  strings: {
    finished: string;
    nextChapter: string;
    noNextChapter: string;
  };
  nextChapterHtml?: string;
}

/**
 * Reading-layout tokens for the wtr-lab-inspired look.
 *
 * Everything is expressed in reader units (`em`) so the column and the paragraph
 * rhythm scale with the reader text size, and the term colors are resolved from
 * app theme roles (see the `:root` block below) instead of hardcoding the
 * reference palette. Exported so the generated document's contract is asserted
 * in tests rather than only being visible in the WebView.
 */
export const READER_LAYOUT_TOKENS = {
  /** Comfortable measure for the centered column (wtr-lab reads ~40em). */
  columnMax: '40em',
  /** Vertical rhythm between paragraphs — "one paragraph per line". */
  paragraphGap: '1.05em',
  /** Breathing room above the chapter heading block. */
  headingGap: '0.9em',
  /** Inline and fenced code read a touch smaller than body text. */
  codeSize: '0.92em',
  /** Corner radius shared by code surfaces and inline term marks. */
  radius: '10px',
} as const;

/**
 * Why an appended chapter block is missing.
 *
 * `empty` = the chapter resolved to no content at all, `error` = the fetch
 * failed. Both leave the walk parked on the same chapter so a later retry can
 * still pick it up.
 */
export const APPEND_STATUS_KINDS = ['empty', 'error'] as const;
export type AppendStatusKind = (typeof APPEND_STATUS_KINDS)[number];

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Chapter titles come from plugins and land inside markup, so escape them. */
const escapeHtml = (value: string): string =>
  String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

/** Safe JSON serialization for inline scripts. */
const safeJsonStringify = (data: unknown) =>
  JSON.stringify(data).replace(/</g, '\\u003c');

export const generateAppendChapterHtml = (options: {
  html: string;
  chapterId: number;
  chapterName: string;
}): string => {
  const { html, chapterId, chapterName } = options;
  // `core.js` walks `.sorareader-chapter-block[data-chapter-id]` to attribute
  // scroll progress, so both the class and the id attribute must stay exactly as
  // they are here — only the heading markup is restyled.
  return `<div id="ch-${chapterId}" class="sorareader-chapter-block" data-chapter-id="${chapterId}"><div class="chapter-append-divider" data-kind="patch">${escapeHtml(
    chapterName,
  )}</div>${html}</div>`;
};

/**
 * Injection that renders the "why the scroll stopped here" marker in the
 * document. The name is passed as an argument rather than as markup so a plugin
 * chapter title can never inject elements into the reader page.
 */
export const buildAppendStatusCall = (
  chapterId: number,
  chapterName: string,
  kind: AppendStatusKind,
): string =>
  `(function(){if(window.reader&&window.reader.showAppendStatus){window.reader.showAppendStatus(${safeJsonStringify(
    chapterId,
  )},${safeJsonStringify(chapterName)},${safeJsonStringify(kind)});}true;})()`;

/**
 * Injection that removes the marker once the chapter it belongs to is finally
 * appended (e.g. after a retry succeeds).
 */
export const buildClearAppendStatusCall = (chapterId: number): string =>
  `(function(){if(window.reader&&window.reader.clearAppendStatus){window.reader.clearAppendStatus(${safeJsonStringify(
    chapterId,
  )});}true;})()`;

export const generateReaderHtml = (options: HtmlTemplateOptions) => {
  const {
    html,
    theme,
    readerSettings,
    chapterGeneralSettings,
    novel,
    chapter,
    nextChapter,
    prevChapter,
    assetsUriPrefix,
    batteryLevel,
    readerBottomInset = 0,
    readerTopInset = StatusBar.currentHeight ?? 0,
    pluginCustomCSS = '',
    pluginCustomJS = '',
    nextChapterScreenVisible = false,
    pendingScrollPosition,
    readerDir: providedReaderDir,
    getLocalServerUrl,
    isSettingsPreview = false,
    strings,
    nextChapterHtml = '',
  } = options;

  const readerDir =
    providedReaderDir || (readerSettings.textAlign === 'right' ? 'rtl' : 'ltr');

  const initialReaderConfig = {
    readerSettings,
    chapterGeneralSettings,
    novel,
    chapter,
    nextChapter,
    prevChapter,
    batteryLevel,
    autoSaveInterval: 2222,
    initialScrollPosition: pendingScrollPosition,
    DEBUG: __DEV__,
    strings,
  };

  const initialPageReaderConfig = {
    nextChapterScreenVisible,
  };

  const cspMeta =
    !isSettingsPreview && !novel.isLocal
      ? '<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">'
      : '';

  // <meta name="sorareader-chapter-type" content="video">
  const isVideoChapter =
    /<meta\s+name=["']sorareader-chapter-type["']\s+content=["']video["']/i.test(
      html,
    );

  const proxyFetchScript =
    !isSettingsPreview && getLocalServerUrl
      ? `
    <script>
      const ORIGINAL_FETCH = Symbol();
      window[ORIGINAL_FETCH] = window.fetch;
      window.reader.fetch = async function(url, init = {}) {
        const targetUrl = encodeURIComponent(url);
        const proxyUrl = '${getLocalServerUrl()}/proxy?url=' + targetUrl;

        let modifiedHeaders = {};
        if (init.headers) {
          const h = new Headers(init.headers);
          h.forEach((value, key) => {
            modifiedHeaders['x-ln-forward-header-' + key] = value;
          });
        }

        const modifiedInit = { ...init };
        modifiedInit.headers = modifiedHeaders;

        return window[ORIGINAL_FETCH](proxyUrl, modifiedInit);
      };
    </script>
    `
      : '';

  const pluginJsScript =
    !isSettingsPreview && pluginCustomJS
      ? `<script src="${pluginCustomJS}"></script>`
      : '';

  const pluginCssLink =
    !isSettingsPreview && pluginCustomCSS
      ? `<link rel="stylesheet" href="${pluginCustomCSS}">`
      : '';

  const corePlayerScripts = isVideoChapter
    ? `
    <link rel="stylesheet" href="${assetsUriPrefix}/css/core-player.css">
    <script src="${assetsUriPrefix}/js/videoFullscreen.js"></script>
    <script src="${assetsUriPrefix}/js/modules/media/hls.min.js"></script>
    <script src="${assetsUriPrefix}/js/core-player.js"></script>
    `
    : '';

  return `
<!DOCTYPE html>
<html dir="${readerDir}">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    ${cspMeta}
    <link rel="stylesheet" href="${assetsUriPrefix}/css/index.css">
    <link rel="stylesheet" href="${assetsUriPrefix}/css/pageReader.css">
    <link rel="stylesheet" href="${assetsUriPrefix}/css/pullSpinner.css">
    <link rel="stylesheet" href="${assetsUriPrefix}/css/tts.css">
    <style>
      :root {
        --reader-topInset: ${readerTopInset}px;
        --readerSettings-theme: ${readerSettings.theme};
        --readerSettings-padding: ${readerSettings.padding}px;
        --readerSettings-textSize: ${readerSettings.textSize}px;
        --readerSettings-textColor: ${readerSettings.textColor};
        --readerSettings-textAlign: ${readerSettings.textAlign};
        --readerSettings-lineHeight: ${readerSettings.lineHeight};
        --readerSettings-fontFamily: ${readerSettings.fontFamily};
        --theme-primary: ${theme.primary};
        --theme-onPrimary: ${theme.onPrimary};
        --theme-secondary: ${theme.secondary};
        --theme-tertiary: ${theme.tertiary};
        --theme-onTertiary: ${theme.onTertiary};
        --theme-onSecondary: ${theme.onSecondary};
        --theme-surface: ${theme.surface};
        --theme-surface-0-9: ${color(theme.surface).alpha(0.9).toString()};
        --theme-onSurface: ${theme.onSurface};
        --theme-surfaceVariant: ${theme.surfaceVariant};
        --theme-onSurfaceVariant: ${theme.onSurfaceVariant};
        --theme-outline: ${theme.outline};
        --theme-rippleColor: ${theme.rippleColor};
        --reader-bottomInset: ${readerBottomInset}px;

        /* --- reading-layout tokens (values in READER_LAYOUT_TOKENS) --- */
        --reader-columnMax: ${READER_LAYOUT_TOKENS.columnMax};
        --reader-paragraphGap: ${READER_LAYOUT_TOKENS.paragraphGap};
        --reader-headingGap: ${READER_LAYOUT_TOKENS.headingGap};
        --reader-codeSize: ${READER_LAYOUT_TOKENS.codeSize};
        --reader-radius: ${READER_LAYOUT_TOKENS.radius};

        /* Term marks map onto the app's own roles instead of a fixed palette, so
           the wtr-lab term blue (the app primary) and its two siblings follow
           the active theme. Patch terms keep the reference reader's green,
           picked per color scheme so they stay legible on dark and light. */
        --reader-termUser: ${theme.primary};
        --reader-termSystem: ${theme.tertiary};
        --reader-termPatch: ${theme.isDark ? '#8fd694' : '#2e7d32'};
      }

      img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 0 auto;
      }

      /* Narrow, centered measure. On phones the cap is wider than the viewport,
         so the padding slider still owns the layout; on tablets and landscape it
         caps the line length the way the reference reader does. Paged mode opts
         out (pageReader.css owns the column geometry there). */
      body:not(.page-reader) #SoraReader-chapter,
      body:not(.page-reader) .sorareader-chapter-block,
      body:not(.page-reader) #SoraReader-next-chapter-seamless {
        box-sizing: border-box;
        max-width: var(--reader-columnMax);
        margin-left: auto;
        margin-right: auto;
      }

      /* Paragraph rhythm: a generous, even gap between paragraphs, with the
         scraped <br><br> runs collapsed so the gap is not doubled up by the
         markup. */
      body:not(.page-reader) .sorareader-chapter-block p,
      body:not(.page-reader) #SoraReader-next-chapter-seamless p {
        margin: 0 0 var(--reader-paragraphGap);
      }
      body:not(.page-reader) .sorareader-chapter-block p:last-child,
      body:not(.page-reader) #SoraReader-next-chapter-seamless p:last-child {
        margin-bottom: 0;
      }
      body:not(.page-reader) .sorareader-chapter-block p:empty {
        display: none;
      }
      body:not(.page-reader) .sorareader-chapter-block br + br {
        display: none;
      }

      /* Code styling uses only generic families already present in the WebView —
         no font dependency is added for it. */
      body code,
      body kbd,
      body samp,
      body pre {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      body code,
      body kbd,
      body samp {
        font-size: var(--reader-codeSize);
        padding: 0.1em 0.32em;
        border-radius: 5px;
        background-color: color-mix(
          in srgb,
          var(--theme-onSurface, #888) 12%,
          transparent
        );
      }
      body pre {
        font-size: var(--reader-codeSize);
        line-height: 1.55;
        max-width: 100%;
        overflow-x: auto;
        margin: 0 0 var(--reader-paragraphGap);
        padding: 0.85em 1em;
        border: 1px solid color-mix(
          in srgb,
          var(--theme-outline, #888) 45%,
          transparent
        );
        border-radius: var(--reader-radius);
        background-color: color-mix(
          in srgb,
          var(--theme-onSurface, #888) 6%,
          transparent
        );
      }
      body pre code {
        font-size: inherit;
        padding: 0;
        border-radius: 0;
        background-color: transparent;
      }

      #SoraReader-title-novel {
        display: block;
        font-size: 1.25em;
        font-weight: bold;
        text-align: center;
        padding: var(--reader-headingGap) var(--readerSettings-padding) 0.8em;
        color: var(--readerSettings-textColor);
        opacity: 0.8;
        line-height: 1.4;
      }

      .chapter-title-divider {
        display: block;
        font-size: 1.1em;
        font-weight: bold;
        text-align: center;
        padding: var(--reader-headingGap) var(--readerSettings-padding) 0.6em;
        color: var(--readerSettings-textColor);
        opacity: 0.75;
        line-height: 1.4;
      }

      .chapter-append-divider {
        display: block;
        font-size: 1.1em;
        font-weight: bold;
        text-align: center;
        padding: var(--reader-headingGap) var(--readerSettings-padding) 0.6em;
        color: var(--readerSettings-textColor);
        opacity: 0.75;
        line-height: 1.4;
        margin-top: 2.4em;
        border-top: 1.5px solid var(--theme-outline, rgba(128,128,128,0.35));
      }

      /* --- term marks -------------------------------------------------------
         .lnr-term is the user-defined term (its color, when the user picked one,
         arrives as an inline style and still wins). data-kind marks who owns a
         span: the reader's own chrome ('system'), content the reader inserted or
         rewrote ('patch'), and the user's terms (plain .lnr-term). The color
         rules match any element so plugin markup that tags its own spans is
         colored too; the highlight chrome stays limited to term spans. */
      .lnr-term {
        border-bottom: 1.5px dashed
          var(--reader-termUser, var(--theme-primary, currentColor));
        cursor: pointer;
      }
      .lnr-term[data-scope='global'] {
        border-bottom-style: dotted;
      }
      [data-kind='system'] {
        color: var(--reader-termSystem, var(--theme-tertiary, currentColor));
      }
      [data-kind='patch'] {
        color: var(--reader-termPatch, var(--theme-onSurfaceVariant, inherit));
      }
      .lnr-term[data-kind='system'] {
        border-bottom-color: var(
          --reader-termSystem,
          var(--theme-tertiary, currentColor)
        );
        padding: 0 0.14em;
        border-radius: 4px;
        background-color: color-mix(
          in srgb,
          var(--reader-termSystem, var(--theme-tertiary, currentColor)) 14%,
          transparent
        );
      }
      .lnr-term[data-kind='patch'] {
        border-bottom-color: var(
          --reader-termPatch,
          var(--theme-onSurfaceVariant, inherit)
        );
        border-bottom-style: solid;
        padding: 0 0.14em;
        border-radius: 4px;
        background-color: color-mix(
          in srgb,
          var(--reader-termPatch, var(--theme-onSurfaceVariant, currentColor))
            12%,
          transparent
        );
      }

      #lnr-term-tooltip {
        display: none;
        position: fixed;
        background: var(--theme-surface, #fff);
        color: var(--theme-onSurface, #000);
        border: 1px solid var(--theme-outline, #ccc);
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 13px;
        max-width: 280px;
        z-index: 9999;
        box-shadow: 0 4px 16px rgba(0,0,0,0.22);
        pointer-events: none;
        line-height: 1.6;
      }
      #lnr-term-tooltip.lnr-visible { display: block; }
      #lnr-term-tooltip .lnr-tt-label {
        font-size: 11px;
        opacity: 0.6;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
      }
      #lnr-term-tooltip .lnr-tt-original {
        font-weight: bold;
        color: var(--theme-primary, inherit);
        font-size: 15px;
      }
      #lnr-term-tooltip .lnr-tt-arrow {
        opacity: 0.5;
        margin: 2px 0;
        font-size: 12px;
      }
      #lnr-term-tooltip .lnr-tt-replacement {
        font-size: 14px;
      }
      #lnr-term-tooltip .lnr-tt-scope {
        font-size: 11px;
        opacity: 0.55;
        margin-top: 4px;
      }

      @font-face {
        font-family: ${readerSettings.fontFamily};
        src: url("file:///android_asset/fonts/${
          readerSettings.fontFamily
        }.ttf");
      }
    </style>
    ${pluginCssLink}
    <style>${readerSettings.customCSS || ''}</style>
  </head>
  <body class="${chapterGeneralSettings.pageReader ? 'page-reader' : ''}">
    <div id="SoraReader-chapter" class="sorareader-chapter-block" data-chapter-id="${
      chapter.id
    }">
      <div id="SoraReader-title-novel" data-kind="system">
        ${escapeHtml(chapter.name ?? '')}
      </div>
      ${html}  
    </div>
    ${
      nextChapterHtml && nextChapter
        ? `<div id="SoraReader-next-chapter-seamless" data-chapter-id="${nextChapter.id}" style="margin-top:32px; border-top: 1.5px solid var(--theme-outline, #888); padding-top: 8px;">
        <div class="transition-chapter" style="text-align:center; padding: 12px 0 8px 0; font-size:0.97em; opacity:0.7;">
          ${strings.nextChapter}
        </div>
        ${nextChapterHtml}
      </div>`
        : ''
    }
    <div id="reader-append-status-slot"></div>
    <div id="reader-ui"></div>
    <div id="reader-progress-bar"></div>
    <div id="lnr-term-tooltip"></div>
  </body>
  <script>
    window.onerror = function(message, source, lineno, colno, error) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'error',
        msg: message + " at " + source + ":" + lineno + ":" + colno + (error ? "\\n" + error.stack : "")
      }));
      return true;
    };

    var initialPageReaderConfig = ${safeJsonStringify(initialPageReaderConfig)};
    var initialReaderConfig = ${safeJsonStringify(initialReaderConfig)};
  </script>
  <script src="${assetsUriPrefix}/js/modules/core/polyfill-onscrollend.js"></script>
  <script src="${assetsUriPrefix}/js/icons.js"></script>
  <script src="${assetsUriPrefix}/js/modules/core/van.js"></script>
  <script src="${assetsUriPrefix}/js/modules/core/text-vibe.js"></script>
  <script src="${assetsUriPrefix}/js/core.js"></script>
  <script src="${assetsUriPrefix}/js/debug.js"></script>
  <script src="${assetsUriPrefix}/js/theme.js"></script>
  <script src="${assetsUriPrefix}/js/tts.js"></script>
  <script src="${assetsUriPrefix}/js/page-reader.js"></script>
  <script src="${assetsUriPrefix}/js/gestures.js"></script>
  <script src="${assetsUriPrefix}/js/index.js"></script>
  ${proxyFetchScript}
  ${corePlayerScripts}
  ${pluginJsScript}
  <script>
    ${readerSettings.customJS || ''}
  </script>
  <script>
    (function() {
      var _isNearBottomPosted = false;
      var _appendedChapIds = {};
      var _scrollThrottled = false;
      var _progressBar = document.getElementById('reader-progress-bar');
      var _progressFrame = 0;

      // Always-visible reading progress. Driven by a rAF-throttled transform so
      // it never triggers layout, and independent from the footer percentage
      // (which stays behind showScrollPercentage).
      function updateProgressBar() {
        _progressFrame = 0;
        if (!_progressBar) return;
        var doc = document.documentElement;
        var max = (doc.scrollHeight || 0) - (window.innerHeight || 0);
        var ratio;
        if (max > 0) {
          ratio = (window.scrollY || 0) / max;
        } else {
          ratio = max === 0 ? 1 : 0;
        }
        if (ratio < 0) ratio = 0;
        if (ratio > 1) ratio = 1;
        _progressBar.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
      }

      function scheduleProgressBar() {
        if (_progressFrame) return;
        if (window.requestAnimationFrame) {
          _progressFrame = window.requestAnimationFrame(updateProgressBar);
        } else {
          _progressFrame = setTimeout(function() {
            updateProgressBar();
          }, 16);
        }
      }

      function checkNearBottom() {
        var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        var scrollHeight = document.documentElement.scrollHeight;
        var clientHeight = document.documentElement.clientHeight;
        var distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        if (distanceFromBottom < 500 && !_isNearBottomPosted) {
          _isNearBottomPosted = true;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'near-bottom' }));
        }
        if (!_scrollThrottled) {
          _scrollThrottled = true;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scroll' }));
          setTimeout(function() { _scrollThrottled = false; }, 300);
        }
        scheduleProgressBar();
      }

      window.addEventListener('scroll', checkNearBottom, { passive: true });
      window.addEventListener('resize', scheduleProgressBar, { passive: true });
      updateProgressBar();

      if (window.reader) {
        // Re-arm the near-bottom latch after a failed/empty append so the same
        // chapter is retried instead of dead-ending the scroll for the session.
        window.reader.rearmNearBottom = function(delay) {
          setTimeout(function() { _isNearBottomPosted = false; }, delay || 0);
        };

        // Show why the append stopped. Built through the DOM (textContent, not
        // markup) so a plugin chapter title cannot inject elements, and it is
        // deliberately NOT a .sorareader-chapter-block — the progress walk in
        // core.js must never attribute progress to it.
        window.reader.showAppendStatus = function(chapterId, chapterName, kind) {
          window.reader.clearAppendStatus(chapterId);
          var slot = document.getElementById('reader-append-status-slot');
          if (!slot) return;
          var block = document.createElement('div');
          block.className =
            'sorareader-append-status sorareader-append-status--' + kind;
          block.setAttribute('data-append-status', kind);
          block.setAttribute('data-append-status-for', String(chapterId));
          var title = document.createElement('div');
          title.className = 'sorareader-append-status-title';
          title.textContent = chapterName || '';
          var label = document.createElement('div');
          label.className = 'sorareader-append-status-label';
          // Hardcoded English: strings/*.json is out of scope for this change.
          label.textContent =
            kind === 'empty'
              ? 'This chapter is empty.'
              : 'Could not load this chapter. Pull down to retry.';
          block.appendChild(title);
          block.appendChild(label);
          slot.appendChild(block);
          updateProgressBar();
        };

        window.reader.clearAppendStatus = function(chapterId) {
          var slot = document.getElementById('reader-append-status-slot');
          if (!slot) return;
          Array.prototype.slice
            .call(slot.children)
            .forEach(function(node) {
              if (String(chapterId) === node.getAttribute('data-append-status-for')) {
                slot.removeChild(node);
              }
            });
          updateProgressBar();
        };
      }

      window.reader.appendChapter = function(html, chapterId) {
        if (_appendedChapIds[chapterId]) return;
        _appendedChapIds[chapterId] = true;
        var readerUi = document.getElementById('reader-ui');
        if (!readerUi) return;
        // Appending below the viewport must not move what the reader is looking
        // at, so the scroll offset is captured and restored around the insert
        // ('instant' opts out of the CSS smooth scrolling on <html>).
        var scrollBefore = window.scrollY || 0;
        var div = document.createElement('div');
        div.innerHTML = html;
        while (div.firstChild) {
          readerUi.parentNode.insertBefore(div.firstChild, readerUi);
        }
        if ((window.scrollY || 0) !== scrollBefore) {
          window.scrollTo({ top: scrollBefore, behavior: 'instant' });
        }
        _isNearBottomPosted = false;
        updateProgressBar();
      };

      // Term tooltip: show bubble when .lnr-term is tapped
      (function() {
        var tooltip = document.getElementById('lnr-term-tooltip');
        if (!tooltip) return;

        document.addEventListener('click', function(e) {
          var target = e.target;
          while (target && target !== document.body) {
            if (target.classList && target.classList.contains('lnr-term')) break;
            target = target.parentElement;
          }
          if (target && target.classList && target.classList.contains('lnr-term')) {
            var original = decodeURIComponent(target.getAttribute('data-from') || '');
            var replacement = decodeURIComponent(target.getAttribute('data-to') || '');
            var scope = target.getAttribute('data-scope') || '';
            var scopeLabel = scope === 'global' ? 'Global' : 'Novel';
            tooltip.innerHTML =
              '<div class="lnr-tt-label">Teks asli</div>' +
              '<div class="lnr-tt-original">' + original + '</div>' +
              (replacement && replacement !== original
                ? '<div class="lnr-tt-arrow">&#8595; diganti menjadi</div>' +
                  '<div class="lnr-tt-replacement">' + replacement + '</div>'
                : '') +
              '<div class="lnr-tt-scope">Cakupan: ' + scopeLabel + '</div>';

            var rect = target.getBoundingClientRect();
            var vw = window.innerWidth;
            var vh = window.innerHeight;
            var ttW = 280;
            var left = Math.max(8, Math.min(rect.left, vw - ttW - 8));
            var top = rect.bottom + 6;
            if (top + 110 > vh) top = Math.max(8, rect.top - 116);
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.classList.add('lnr-visible');
            e.stopPropagation();
          } else {
            tooltip.classList.remove('lnr-visible');
          }
        });

        document.addEventListener('scroll', function() {
          tooltip.classList.remove('lnr-visible');
        }, { passive: true });
      })();
    })();
  </script>
</html>
  `;
};
