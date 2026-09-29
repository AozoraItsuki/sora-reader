import { ChapterInfo, NovelInfo } from '@database/types';

type ChapterBaseUrlOptions = {
  novel: Partial<NovelInfo>;
  chapter: Partial<ChapterInfo>;
  pluginSite?: string;
  serverUrl: string;
};

/** Base URL a chapter's relative asset references resolve against. */
export const chapterBaseUrl = (options: ChapterBaseUrlOptions): string => {
  const { novel, chapter, pluginSite, serverUrl } = options;
  if (novel.isLocal) {
    // Page images sit next to the chapter's own index.html, so the chapter
    // directory — not the novel directory — is the anchor.
    return `${serverUrl}/local/${novel.id}/${chapter.id}/`;
  }
  if (chapter.isDownloaded) {
    // The local server serves SHARED_NOVELS itself, so server-relative URLs
    // must NOT repeat the `Novels` segment.
    return `${serverUrl}/${novel.pluginId}/${novel.id}/${chapter.id}/`;
  }
  return pluginSite ?? '';
};

const ABSOLUTE_REF = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|#|\/\/)/;

const absolutizeUrl = (value: string, baseUrl: string): string => {
  if (value === '' || ABSOLUTE_REF.test(value)) {
    return value;
  }
  return new URL(value, baseUrl).href;
};

const absolutizeSrcset = (value: string, baseUrl: string): string =>
  value
    .split(',')
    .map(candidate => {
      const parts = candidate.trim().split(/\s+/);
      const url = parts.shift() ?? '';
      const descriptor = parts.join(' ');
      const resolved = absolutizeUrl(url, baseUrl);
      return descriptor === '' ? resolved : `${resolved} ${descriptor}`;
    })
    .join(', ');

const ATTR_REF = /(\s(?:src|data-src|href)=)(?:"([^"]*)"|'([^']*)')/g;
const SRCSET_REF = /(\ssrcset=)(?:"([^"]*)"|'([^']*)')/g;

/** Anchor a chapter's relative asset references to its base URL. */
export const absolutizeAssetRefs = (html: string, baseUrl: string): string => {
  if (baseUrl === '') {
    return html;
  }
  return html
    .replace(
      ATTR_REF,
      (match, prefix: string, doubleQuoted: string, singleQuoted: string) => {
        const quote = doubleQuoted !== undefined ? '"' : "'";
        const value = (doubleQuoted ?? singleQuoted ?? '') as string;
        return `${prefix}${quote}${absolutizeUrl(value, baseUrl)}${quote}`;
      },
    )
    .replace(
      SRCSET_REF,
      (match, prefix: string, doubleQuoted: string, singleQuoted: string) => {
        const quote = doubleQuoted !== undefined ? '"' : "'";
        const value = (doubleQuoted ?? singleQuoted ?? '') as string;
        return `${prefix}${quote}${absolutizeSrcset(value, baseUrl)}${quote}`;
      },
    );
};
