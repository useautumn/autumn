/**
 * Strips JSDoc tags from a description string.
 * Returns content up to the first @ tag (trimmed).
 */
export function stripJsDocTags(description: string): string {
	// Find the first @ tag that starts a line (common JSDoc tags)
	const tagPatterns = [
		/@example\b/,
		/@param\b/,
		/@see\b/,
		/@returns?\b/,
		/@throws?\b/,
		/@deprecated\b/,
		/@since\b/,
		/@version\b/,
		/@author\b/,
		/@link\b/,
		/@type\b/,
		/@typedef\b/,
		/@property\b/,
		/@default\b/,
	];

	let cutIndex = description.length;

	for (const pattern of tagPatterns) {
		const match = description.match(pattern);
		if (match && match.index !== undefined && match.index < cutIndex) {
			cutIndex = match.index;
		}
	}

	return description.slice(0, cutIndex).trim();
}
