/** expected ⊆ actual; arrays: every expected element matches some actual one */
export const subsetMatch = (expected: unknown, actual: unknown): boolean => {
	if (expected === null || typeof expected !== "object")
		return expected === actual;
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual)) return false;
		return expected.every((expectedItem) =>
			actual.some((actualItem) => subsetMatch(expectedItem, actualItem)),
		);
	}
	if (actual === null || typeof actual !== "object") return false;
	return Object.entries(expected).every(([key, value]) =>
		subsetMatch(value, (actual as Record<string, unknown>)[key]),
	);
};
