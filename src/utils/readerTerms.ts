import { getMMKVObject, setMMKVObject } from './mmkv/mmkv';

export interface TermStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export interface ReaderTerm {
  id: string;
  from: string;
  to: string;
  scope: 'novel' | 'global';
  caseSensitive: boolean;
  style?: TermStyle;
}

const GLOBAL_TERMS_KEY = 'READER_TERMS_GLOBAL';
const novelTermsKey = (novelId: number) => `READER_TERMS_NOVEL_${novelId}`;

export function getGlobalTerms(): ReaderTerm[] {
  return getMMKVObject<ReaderTerm[]>(GLOBAL_TERMS_KEY) ?? [];
}

export function getNovelTerms(novelId: number): ReaderTerm[] {
  return getMMKVObject<ReaderTerm[]>(novelTermsKey(novelId)) ?? [];
}

/**
 * Per-novel term snapshot. The reader calls this once for the initial HTML and
 * again for every infinite-scroll append; returning the *same* array until a
 * term write invalidates it keeps those chunks consistent without forcing a
 * WebView reload while scrolling.
 */
const allTermsCache = new Map<number, ReaderTerm[]>();

export function getAllTermsForNovel(novelId: number): ReaderTerm[] {
  const cached = allTermsCache.get(novelId);
  if (cached) return cached;
  const snapshot = [...getGlobalTerms(), ...getNovelTerms(novelId)];
  allTermsCache.set(novelId, snapshot);
  return snapshot;
}

/** Drop the cached snapshot after a term write (or any external MMKV change). */
export function refreshAllTermsForNovel(novelId: number): ReaderTerm[] {
  allTermsCache.delete(novelId);
  return getAllTermsForNovel(novelId);
}

function invalidateAllTermsCache(): void {
  allTermsCache.clear();
}

export function saveGlobalTerms(terms: ReaderTerm[]): void {
  setMMKVObject(GLOBAL_TERMS_KEY, terms);
  invalidateAllTermsCache();
}

export function saveNovelTerms(novelId: number, terms: ReaderTerm[]): void {
  setMMKVObject(novelTermsKey(novelId), terms);
  invalidateAllTermsCache();
}

function wrapWithStyle(text: string, style?: TermStyle): string {
  if (!hasTermStyle(style)) return text;
  const { bold, italic, underline, color } = style!;
  let result = text;
  if (bold) result = `<strong>${result}</strong>`;
  if (italic) result = `<em>${result}</em>`;
  if (underline) result = `<u>${result}</u>`;
  if (color) result = `<span style="color:${color}">${result}</span>`;
  return result;
}

/**
 * True when the style would render any visible mark.
 * Terms without a style still get their text replaced, but must not be
 * wrapped in a `.lnr-term` span — the reader CSS underlines every such
 * span, which would mark text the user never styled.
 */
export function hasTermStyle(style?: TermStyle): boolean {
  return Boolean(
    style && (style.bold || style.italic || style.underline || style.color),
  );
}

/**
 * Stable identity for one generated mark. The runtime WebView script re-derives
 * the exact same signature (see buildApplyTermsJs) so it can leave a matching
 * span untouched instead of reverting it to raw text and rebuilding it.
 */
export function termMatchSignature(original: string, term: ReaderTerm): string {
  const { style } = term;
  const normalized: Record<string, string | true> = {};
  if (style?.bold) normalized.bold = true;
  if (style?.italic) normalized.italic = true;
  if (style?.underline) normalized.underline = true;
  if (style?.color) normalized.color = style.color;
  return [
    encodeURIComponent(original),
    encodeURIComponent(term.from ?? ''),
    encodeURIComponent(term.to ?? ''),
    encodeURIComponent(JSON.stringify(normalized)),
    encodeURIComponent(term.scope ?? ''),
    term.caseSensitive ? '1' : '0',
  ].join('|');
}

/**
 * Build a RegExp from a term's `from` string.
 * Supports `|` as OR operator: "hero|protagonist" matches either word.
 */
function buildTermRegex(from: string, caseSensitive: boolean): RegExp | null {
  const parts = from
    .split('|')
    .map(p => p.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean);
  if (!parts.length) return null;
  return new RegExp(`(${parts.join('|')})`, caseSensitive ? 'g' : 'gi');
}

type Segment = { content: string; html: string | null };

/**
 * Apply terms to a plain-text string using a segment approach.
 * Already-replaced segments are skipped so later terms can't corrupt them.
 * Returns an HTML string with replacements wrapped in <span class="lnr-term">.
 */
function applyTermsToText(text: string, terms: ReaderTerm[]): string {
  let segments: Segment[] = [{ content: text, html: null }];

  for (const term of terms) {
    if (!term.from || !term.from.trim()) continue;
    const re = buildTermRegex(term.from, term.caseSensitive);
    if (!re) continue;

    const newSegments: Segment[] = [];

    for (const seg of segments) {
      if (seg.html !== null) {
        newSegments.push(seg);
        continue;
      }

      let lastIndex = 0;
      let m: RegExpExecArray | null;
      re.lastIndex = 0;

      while ((m = re.exec(seg.content)) !== null) {
        if (m.index > lastIndex) {
          newSegments.push({
            content: seg.content.slice(lastIndex, m.index),
            html: null,
          });
        }

        const originalMatch = m[0];
        const inner = wrapWithStyle(term.to, term.style);
        const styled = hasTermStyle(term.style);
        const fromEncoded = encodeURIComponent(originalMatch);
        const toEncoded = encodeURIComponent(term.to);
        const spanHtml = styled
          ? `<span class="lnr-term" data-lnr-sig="${termMatchSignature(
              originalMatch,
              term,
            )}" data-from="${fromEncoded}" data-to="${toEncoded}" data-scope="${
              term.scope
            }">${inner}</span>`
          : inner;
        newSegments.push({ content: originalMatch, html: spanHtml });

        lastIndex = m.index + m[0].length;
      }

      if (lastIndex < seg.content.length) {
        newSegments.push({ content: seg.content.slice(lastIndex), html: null });
      }
    }

    segments = newSegments;
  }

  return segments.map(s => (s.html !== null ? s.html : s.content)).join('');
}

/**
 * Apply all terms to a raw HTML string.
 * Only text content between tags is processed (avoids touching HTML attributes/tags).
 */
export function applyTermsToHtml(html: string, terms: ReaderTerm[]): string {
  if (!terms.length) return html;
  const activeTerms = terms.filter(t => t.from && t.from.trim());
  if (!activeTerms.length) return html;

  return html.replace(/>([^<]*)</g, (match, textContent) => {
    if (!textContent || !textContent.trim()) return match;
    const replaced = applyTermsToText(textContent, activeTerms);
    return '>' + replaced + '<';
  });
}

/**
 * Build the JavaScript string injected into the WebView for dynamic term application.
 *
 * Idempotent + chunk-scoped: every chapter block (initial, appended, seamless)
 * is reconciled in place. A span whose `data-lnr-sig` still matches the current
 * term is left completely untouched — no revert to raw text, no repaint, so
 * highlights never blink while scrolling or re-applying the same terms. Legacy
 * spans that predate the signature are upgraded in place.
 *
 * Supports:
 * - | as OR operator
 * - Styled terms (HTML markup in replacement)
 * - In-place updates on term edits and removal of now-inactive marks
 * - Click bubble feature (via .lnr-term data attributes)
 */
export function buildApplyTermsJs(terms: ReaderTerm[]): string {
  const activeTerms = terms.filter(t => t.from && t.from.trim());
  const safeTerms = JSON.stringify(activeTerms).replace(/</g, '\\u003c');

  return `(function(){
var terms=${safeTerms};
//querySelectorAll de-duplicates nodes matching more than one selector, so the
//initial block is not processed twice.
var blocks=document.querySelectorAll('.sorareader-chapter-block, #SoraReader-next-chapter-seamless');
if(!blocks.length)return;

function esc(s){var re=new RegExp('[.*+?^$'+'{}()|[\\\\]\\\\\\\\]','g');return s.replace(re,'\\\\$&');}
function buildRe(fromStr,cs){
  var parts=String(fromStr||'').split('|').map(function(p){return esc(p.trim());}).filter(Boolean);
  if(!parts.length)return null;
  return new RegExp('('+parts.join('|')+')',cs?'g':'gi');
}
function normalizedStyle(style){
  var s=style||{};var out={};
  if(s.bold)out.bold=true;
  if(s.italic)out.italic=true;
  if(s.underline)out.underline=true;
  if(s.color)out.color=s.color;
  return out;
}
function hasTermStyle(style){
  return Boolean(style&&(style.bold||style.italic||style.underline||style.color));
}
function wrapStyle(text,style){
  if(!hasTermStyle(style))return text;
  var r=text;
  if(style.bold)r='<strong>'+r+'</strong>';
  if(style.italic)r='<em>'+r+'</em>';
  if(style.underline)r='<u>'+r+'</u>';
  if(style.color)r='<span style="color:'+style.color+'">'+r+'</span>';
  return r;
}
//Must stay byte-for-byte equivalent to termMatchSignature() in readerTerms.ts.
function signature(original,term){
  return encodeURIComponent(original)+'|'+encodeURIComponent(term.from||'')+'|'+encodeURIComponent(term.to||'')+'|'+encodeURIComponent(JSON.stringify(normalizedStyle(term.style)))+'|'+encodeURIComponent(term.scope||'')+'|'+(term.caseSensitive?'1':'0');
}
//The first term whose pattern matches the *whole* original text is the one the
//segment algorithm would have applied, so it identifies an existing mark.
function findTerm(original){
  for(var i=0;i<terms.length;i++){
    var t=terms[i];var re=buildRe(t.from,t.caseSensitive);
    if(!re)continue;re.lastIndex=0;
    var m=re.exec(original);
    if(m&&m[0]===original)return t;
  }
  return null;
}
function writeSpan(span,original,term){
  span.setAttribute('data-from',encodeURIComponent(original));
  span.setAttribute('data-to',encodeURIComponent(term.to||''));
  span.setAttribute('data-scope',term.scope||'');
  span.setAttribute('data-lnr-sig',signature(original,term));
  span.innerHTML=wrapStyle(term.to||'',term.style);
}

var blockList=Array.prototype.slice.call(blocks);
blockList.forEach(function(block){
  //1) Reconcile existing marks. Matching spans are skipped entirely; only
  //   edited/legacy marks are rewritten, and removed terms are unwrapped.
  var existing=Array.prototype.slice.call(block.querySelectorAll('.lnr-term'));
  existing.forEach(function(span){
    if(!span.parentNode)return;
    var original=decodeURIComponent(span.getAttribute('data-from')||'');
    if(!original)return;
    var term=findTerm(original);
    if(!term){
      //Only reached on an actual edit/deletion — never during scrolling.
      span.replaceWith(original);
      return;
    }
    var sig=signature(original,term);
    if(span.getAttribute('data-lnr-sig')===sig)return;
    //Legacy span that already renders the right markup: just stamp the marker.
    var expected=wrapStyle(term.to||'',term.style);
    if(span.innerHTML===expected&&span.getAttribute('data-to')===encodeURIComponent(term.to||'')&&span.getAttribute('data-scope')===(term.scope||'')){
      span.setAttribute('data-lnr-sig',sig);
      return;
    }
    writeSpan(span,original,term);
  });

  if(!terms.length)return;

  //2) Apply terms only to untouched text nodes; existing marks are opaque.
  var walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,null);
  var nodes=[];var n;
  while((n=walker.nextNode()))nodes.push(n);
  nodes.forEach(function(textNode){
    var parent=textNode.parentNode;
    if(!parent)return;
    var anc=parent;
    while(anc&&anc!==block){
      if(anc.nodeType===1&&anc.classList&&anc.classList.contains('lnr-term'))return;
      anc=anc.parentNode;
    }
    var text=textNode.nodeValue;
    if(!text||!text.trim())return;
    var hasMatch=false;
    for(var i=0;i<terms.length;i++){
      var re=buildRe(terms[i].from,terms[i].caseSensitive);
      if(re&&re.test(text)){hasMatch=true;break;}
    }
    if(!hasMatch)return;

    var segs=[{content:text,html:null}];
    for(var i=0;i<terms.length;i++){
      var term=terms[i];
      var re=buildRe(term.from,term.caseSensitive);
      if(!re)continue;
      var newSegs=[];
      for(var s=0;s<segs.length;s++){
        var seg=segs[s];
        if(seg.html!==null){newSegs.push(seg);continue;}
        var lastIdx=0;var m;re.lastIndex=0;
        while((m=re.exec(seg.content))!==null){
          if(m.index>lastIdx)newSegs.push({content:seg.content.slice(lastIdx,m.index),html:null});
          var orig=m[0];
          var styled=wrapStyle(term.to||'',term.style);
          var spanHtml=hasTermStyle(term.style)
            ?'<span class="lnr-term" data-lnr-sig="'+signature(orig,term)+'" data-from="'+encodeURIComponent(orig)+'" data-to="'+encodeURIComponent(term.to||'')+'" data-scope="'+(term.scope||'')+'">'+styled+'</span>'
            :styled;
          newSegs.push({content:orig,html:spanHtml});
          lastIdx=m.index+m[0].length;
        }
        if(lastIdx<seg.content.length)newSegs.push({content:seg.content.slice(lastIdx),html:null});
      }
      segs=newSegs;
    }

    var resultHtml=segs.map(function(s){return s.html!==null?s.html:s.content;}).join('');
    var tmp=document.createElement('span');
    tmp.innerHTML=resultHtml;
    var host=textNode.parentNode;
    if(!host)return;
    while(tmp.firstChild)host.insertBefore(tmp.firstChild,textNode);
    host.removeChild(textNode);
  });
});
})()`;
}
