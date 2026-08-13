/**
 * Decodes HTML entities found in scraped page metadata.
 * Titles/descriptions come out of raw HTML, so they arrive entity-encoded
 * ("Trump can&#x27;t") and would otherwise be re-escaped on render.
 */

const NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  middot: "·",
  bull: "•",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ouml: "ö",
  uuml: "ü",
  auml: "ä",
  szlig: "ß",
  ntilde: "ñ",
};

/**
 * Some sources (X, GitHub, Craigslist) serve double- or triple-encoded text:
 * "&amp;amp;" should display as "&". Decoding repeatedly resolves those, and is
 * safe here because callers escape the result before it reaches the page.
 * Capped so a string of literal "&amp;" text can't be chewed down forever.
 */
export function decodeEntities(str) {
  if (!str) return str;

  let out = str;
  for (let pass = 0; pass < 3; pass++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

function decodeOnce(str) {
  return str.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);

      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      // Lone surrogates aren't valid scalar values; leave them as-is.
      if (code >= 0xd800 && code <= 0xdfff) return match;

      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }

    const named = NAMED[entity] ?? NAMED[entity.toLowerCase()];
    return named ?? match;
  });
}
