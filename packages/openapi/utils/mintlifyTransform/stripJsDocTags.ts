export function stripJsDocTags(description: string): string {
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
