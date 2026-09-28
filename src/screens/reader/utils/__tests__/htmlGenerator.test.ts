import {
  initialChapterGeneralSettings,
  initialChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import type { ThemeColors } from '@theme/types';
import { StatusBar } from 'react-native';

import { generateReaderHtml, HtmlTemplateOptions } from '../htmlGenerator';

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
