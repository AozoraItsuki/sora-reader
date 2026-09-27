/**
 * The asset references a chapter document carries.
 *
 * A chapter is written once and read twice: the EPUB importer reduces every
 * reference to a bare filename, and the reader then anchors those bare names to
 * the base URL of the chapter they belong to. Both walks have to agree on which
 * attributes carry a reference and on how a `srcset` candidate list is split --
 * a reference one of them skips is an image the reader resolves against a file
 * that was never copied -- so the shape lives here instead of in either of them.
 */

/**
 * A `src`/`href` value, or a `srcset`/`data-src` reference, with its quotes and
 * its attribute name, so a rewrite can put them back byte for byte.
 */
const ASSET_REF = /(\s)(src|href|srcset|data-src)(\s*=\s*)(["'])([^]*?)\4/gi;

/**
 * Run `map` over every asset reference url of `html` and rebuild the document.
 *
 * `map` is handed a single reference url -- the url of a `srcset` candidate
 * arrives already split from its descriptor -- and returns the url to put in
 * its place, or null to leave the reference exactly as it was. Observing the
 * references a caller replaced is left to its callback, so the document is only
 * walked once.
 */
export const mapAssetRefs = (
  html: string,
  map: (url: string) => string | null,
): string => {
  const rewriteValue = (value: string, attribute: string): string => {
    // `srcset` holds a comma-separated candidate list of `url descriptor`;
    // every other attribute holds a single url.
    const candidates = attribute === 'srcset' ? value.split(',') : [value];
    return candidates
      .map(candidate => {
        const url = candidate.trimStart().split(/\s/)[0] ?? '';
        if (!url) {
          return candidate;
        }
        const replacement = map(url);
        return replacement === null
          ? candidate
          : candidate.replace(url, () => replacement);
      })
      .join(',');
  };

  return html.replace(
    ASSET_REF,
    (
      match: string,
      lead: string,
      attribute: string,
      eq: string,
      quote: string,
      value: string,
    ) => `${lead}${attribute}${eq}${quote}${rewriteValue(value, attribute.toLowerCase())}${quote}`,
  );
};
