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

export function decodeEntities(str) {
  if (!str) return str;

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
