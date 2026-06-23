const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#039;",
};

const escapeHtml = (value: string): string =>
	value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const JSON_TOKEN =
	/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/**
 * Highlight a single line of pretty-printed JSON. Strings never span lines in
 * 2-space-indented JSON, so each line tokenizes independently — letting callers
 * virtualize and highlight only the visible lines.
 */
export function highlightJsonLine(line: string): string {
	let result = "";
	let lastIndex = 0;

	for (const match of line.matchAll(JSON_TOKEN)) {
		const [full, string, colon, keyword, number] = match;
		const index = match.index;
		result += escapeHtml(line.slice(lastIndex, index));

		if (string !== undefined) {
			const isKey = colon !== undefined;
			const className = isKey
				? "text-sky-700 dark:text-sky-300"
				: "text-emerald-700 dark:text-emerald-300";
			result += `<span class="${className}">${escapeHtml(string)}</span>`;
			if (colon) result += escapeHtml(colon);
		} else if (keyword !== undefined) {
			const className =
				keyword === "null"
					? "text-tertiary-foreground"
					: "text-purple-700 dark:text-purple-300";
			result += `<span class="${className}">${keyword}</span>`;
		} else if (number !== undefined) {
			result += `<span class="text-amber-700 dark:text-amber-400">${number}</span>`;
		}

		lastIndex = index + full.length;
	}

	result += escapeHtml(line.slice(lastIndex));
	return result;
}

/** Highlight a full JSON document. Prefer the virtualized viewer for rendering;
 * use this only for non-DOM consumers (e.g. copy-to-clipboard fallbacks). */
export function highlightJson(json: string): string {
	return json.split("\n").map(highlightJsonLine).join("\n");
}
