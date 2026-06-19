import { getMMKVObject, setMMKVObject } from './mmkv/mmkv';

export interface ReaderTerm {
  id: string;
  from: string;
  to: string;
  scope: 'novel' | 'global';
  caseSensitive: boolean;
}

const GLOBAL_TERMS_KEY = 'READER_TERMS_GLOBAL';
const novelTermsKey = (novelId: number) => `READER_TERMS_NOVEL_${novelId}`;

export function getGlobalTerms(): ReaderTerm[] {
  return getMMKVObject<ReaderTerm[]>(GLOBAL_TERMS_KEY) ?? [];
}

export function getNovelTerms(novelId: number): ReaderTerm[] {
  return getMMKVObject<ReaderTerm[]>(novelTermsKey(novelId)) ?? [];
}

export function getAllTermsForNovel(novelId: number): ReaderTerm[] {
  return [...getGlobalTerms(), ...getNovelTerms(novelId)];
}

export function saveGlobalTerms(terms: ReaderTerm[]): void {
  setMMKVObject(GLOBAL_TERMS_KEY, terms);
}

export function saveNovelTerms(novelId: number, terms: ReaderTerm[]): void {
  setMMKVObject(novelTermsKey(novelId), terms);
}

export function applyTermsToHtml(html: string, terms: ReaderTerm[]): string {
  if (!terms.length) {
    return html;
  }
  return html.replace(/>([^<]*)</g, (match, textContent) => {
    if (!textContent) {
      return match;
    }
    let replaced = textContent;
    for (const term of terms) {
      if (!term.from) {
        continue;
      }
      try {
        const escaped = term.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flags = term.caseSensitive ? 'g' : 'gi';
        replaced = replaced.replace(new RegExp(escaped, flags), term.to);
      } catch {
        // ignore invalid regex
      }
    }
    return '>' + replaced + '<';
  });
}
