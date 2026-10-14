function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = [];

	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}

	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1,
					matrix[i][j - 1] + 1,
					matrix[i - 1][j] + 1,
				);
			}
		}
	}

	return matrix[b.length][a.length];
}

export function calculateRelevanceScore(
	searchTerm: string,
	text: string,
): number {
	const lowerSearch = searchTerm.toLowerCase();
	const lowerText = text.toLowerCase();

	if (lowerText === lowerSearch) return 0;

	if (lowerText.startsWith(lowerSearch)) return 1;

	const indexOfSearch = lowerText.indexOf(lowerSearch);
	if (indexOfSearch !== -1) {
		return 2 + indexOfSearch / 100;
	}

	return 100 + levenshteinDistance(lowerSearch, lowerText);
}
