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

export const generateAppendChapterHtml = (options: {
  html: string;
  chapterId: number;
  chapterName: string;
}): string => {
  const { html, chapterId, chapterName } = options;
  return `<div id="ch-${chapterId}" class="sorareader-chapter-block" data-chapter-id="${chapterId}"><div class="chapter-append-divider">${chapterName}</div>${html}</div>`;
};

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

  // Safe JSON serialization for inline scripts
  const safeJsonStringify = (data: unknown) =>
    JSON.stringify(data).replace(/</g, '\\u003c');

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
      }

      img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 0 auto;
      }

      #SoraReader-title-novel {
        display: block;
        font-size: 1.25em;
        font-weight: bold;
        text-align: center;
        padding: 1.2em var(--readerSettings-padding) 0.8em;
        color: var(--readerSettings-textColor);
        opacity: 0.8;
        line-height: 1.4;
      }

      .chapter-title-divider {
        display: block;
        font-size: 1.1em;
        font-weight: bold;
        text-align: center;
        padding: 1em var(--readerSettings-padding) 0.6em;
        color: var(--readerSettings-textColor);
        opacity: 0.75;
        line-height: 1.4;
      }

      .chapter-append-divider {
        display: block;
        font-size: 1.1em;
        font-weight: bold;
        text-align: center;
        padding: 1em var(--readerSettings-padding) 0.6em;
        color: var(--readerSettings-textColor);
        opacity: 0.75;
        line-height: 1.4;
        margin-top: 32px;
        border-top: 1.5px solid var(--theme-outline, rgba(128,128,128,0.35));
      }

      .lnr-term {
        border-bottom: 1.5px dashed var(--theme-primary, currentColor);
        cursor: pointer;
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
      <div id="SoraReader-title-novel">
        ${chapter.name}
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
    <div id="reader-ui"></div>
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
      }

      window.addEventListener('scroll', checkNearBottom, { passive: true });

      window.reader.appendChapter = function(html, chapterId) {
        if (_appendedChapIds[chapterId]) return;
        _appendedChapIds[chapterId] = true;
        var readerUi = document.getElementById('reader-ui');
        if (!readerUi) return;
        var div = document.createElement('div');
        div.innerHTML = html;
        while (div.firstChild) {
          readerUi.parentNode.insertBefore(div.firstChild, readerUi);
        }
        _isNearBottomPosted = false;
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
