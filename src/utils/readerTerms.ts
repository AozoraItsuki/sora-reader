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

export function getAllTermsForNovel(novelId: number): ReaderTerm[] {
  return [...getGlobalTerms(), ...getNovelTerms(novelId)];
}

export function saveGlobalTerms(terms: ReaderTerm[]): void {
  setMMKVObject(GLOBAL_TERMS_KEY, terms);
}

export function saveNovelTerms(novelId: number, terms: ReaderTerm[]): void {
  setMMKVObject(novelTermsKey(novelId), terms);
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
          ? `<span class="lnr-term" data-from="${fromEncoded}" data-to="${toEncoded}" data-scope="${term.scope}">${inner}</span>`
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
 * Build the JavaScript string to inject into the WebView for dynamic term application.
 * Supports:
 * - | as OR operator
 * - Styled terms (HTML markup in replacement)
 * - Re-applying when terms change (reverts previous .lnr-term spans first)
 * - Click bubble feature (via .lnr-term data attributes)
 */
export function buildApplyTermsJs(terms: ReaderTerm[]): string {
  const activeTerms = terms.filter(t => t.from && t.from.trim());
  const safeTerms = JSON.stringify(activeTerms).replace(/</g, '\\u003c');

  return `(function(){
var terms=${safeTerms};
var chEl=document.getElementById('SoraReader-chapter');
if(!chEl)return;

function esc(s){var re=new RegExp('[.*+?^$'+'{}()|[\\\\]\\\\\\\\]','g');return s.replace(re,'\\\\$&');}
function buildRe(fromStr,cs){
  var parts=fromStr.split('|').map(function(p){return esc(p.trim());}).filter(Boolean);
  if(!parts.length)return null;
  return new RegExp('('+parts.join('|')+')',cs?'g':'gi');
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
function hasTermStyle(style){
  return Boolean(style&&(style.bold||style.italic||style.underline||style.color));
}

var existing=Array.prototype.slice.call(chEl.querySelectorAll('.lnr-term'));
existing.forEach(function(span){
  var orig=decodeURIComponent(span.getAttribute('data-from')||'');
  if(orig&&span.parentNode){span.parentNode.replaceChild(document.createTextNode(orig),span);}
});
chEl.normalize();

if(!terms.length)return;

var walker=document.createTreeWalker(chEl,NodeFilter.SHOW_TEXT,null);
var nodes=[];var n;
while((n=walker.nextNode()))nodes.push(n);

nodes.forEach(function(textNode){
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
        var styled=wrapStyle(term.to,term.style);
        var spanHtml=hasTermStyle(term.style)?'<span class="lnr-term" data-from="'+encodeURIComponent(orig)+'" data-to="'+encodeURIComponent(term.to)+'" data-scope="'+(term.scope||'')+'">' +styled+'</span>':styled;
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
  var parent=textNode.parentNode;
  if(!parent)return;
  while(tmp.firstChild)parent.insertBefore(tmp.firstChild,textNode);
  parent.removeChild(textNode);
});
})()`;
}
