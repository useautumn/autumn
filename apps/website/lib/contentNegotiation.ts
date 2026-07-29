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

const NO_MATCH = -1;
const FULL_WILDCARD = 0;
const TYPE_WILDCARD = 1;
const EXACT = 2;

function specificity(
	entry: AcceptEntry,
	type: string,
	subtype: string,
): number {
	if (entry.type === type && entry.subtype === subtype) return EXACT;
	if (entry.type === type && entry.subtype === "*") return TYPE_WILDCARD;
	if (entry.type === "*" && entry.subtype === "*") return FULL_WILDCARD;
	return NO_MATCH;
}

type Match = { quality: number; specificity: number };

function mostSpecificMatch(
	entries: AcceptEntry[],
	mediaType: string,
): Match | null {
	const [wantType = "", wantSubtype = ""] = mediaType.toLowerCase().split("/");
	let bestSpecificity = NO_MATCH;
	let quality: number | null = null;

	for (const entry of entries) {
		const score = specificity(entry, wantType, wantSubtype);
		if (score === NO_MATCH) continue;

		if (
			score > bestSpecificity ||
			(score === bestSpecificity && quality !== null && entry.quality > quality)
		) {
			bestSpecificity = score;
			quality = entry.quality;
		}
	}

	return quality === null ? null : { quality, specificity: bestSpecificity };
}

export type Negotiation = "markdown" | "html" | "not-acceptable";

export function negotiate(acceptHeader: string | null): Negotiation {
	if (!acceptHeader) return "html";

	const entries = parseAcceptHeader(acceptHeader);
	const markdown = mostSpecificMatch(entries, MARKDOWN_TYPE);
	const html = mostSpecificMatch(entries, HTML_TYPE);

	const markdownAcceptable = markdown !== null && markdown.quality > 0;
	const htmlAcceptable = html !== null && html.quality > 0;

	if (!(markdownAcceptable || htmlAcceptable)) return "not-acceptable";
	if (!markdownAcceptable) return "html";
	if (!htmlAcceptable) return "markdown";

	// A bare `*/*` matches both at equal (full-wildcard) specificity — that is no
	// preference, so default to HTML. Serve markdown only when it is asked for
	// more specifically, or at equal specificity with strictly higher quality.
	if (
		markdown.specificity > html.specificity ||
		(markdown.specificity === html.specificity &&
			markdown.quality > html.quality)
	) {
		return "markdown";
	}

	return "html";
}
