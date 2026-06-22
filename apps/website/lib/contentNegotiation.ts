export const MARKDOWN_TYPE = "text/markdown";
export const HTML_TYPE = "text/html";

type AcceptEntry = {
  type: string;
  subtype: string;
  quality: number;
};

function parseAcceptHeader(header: string): AcceptEntry[] {
  return header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawType, ...paramParts] = part.split(";").map((p) => p.trim());
      const [type = "", subtype = ""] = rawType.split("/");

      let quality = 1;
      for (const param of paramParts) {
        const [key, value] = param.split("=").map((p) => p.trim());
        if (key === "q") {
          const parsed = Number.parseFloat(value);
          if (!Number.isNaN(parsed)) quality = parsed;
        }
      }

      return {
        type: type.toLowerCase(),
        subtype: subtype.toLowerCase(),
        quality,
      };
    });
}

function qualityFor(entries: AcceptEntry[], mediaType: string): number | null {
  const [wantType, wantSubtype] = mediaType.toLowerCase().split("/");
  let best: number | null = null;

  for (const entry of entries) {
    const matchesExact =
      entry.type === wantType && entry.subtype === wantSubtype;
    const matchesTypeWildcard =
      entry.type === wantType && entry.subtype === "*";
    const matchesFullWildcard = entry.type === "*" && entry.subtype === "*";

    if (matchesExact || matchesTypeWildcard || matchesFullWildcard) {
      if (best === null || entry.quality > best) best = entry.quality;
    }
  }

  return best;
}

export type Negotiation = "markdown" | "html" | "not-acceptable";

export function negotiate(acceptHeader: string | null): Negotiation {
  if (!acceptHeader) return "html";

  const entries = parseAcceptHeader(acceptHeader);
  const markdownQuality = qualityFor(entries, MARKDOWN_TYPE);
  const htmlQuality = qualityFor(entries, HTML_TYPE);

  const markdownAcceptable = markdownQuality !== null && markdownQuality > 0;
  const htmlAcceptable = htmlQuality !== null && htmlQuality > 0;

  if (!(markdownAcceptable || htmlAcceptable)) return "not-acceptable";

  if (
    markdownAcceptable &&
    (!htmlAcceptable || markdownQuality >= htmlQuality)
  ) {
    return "markdown";
  }

  return "html";
}
