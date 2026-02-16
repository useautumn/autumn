export const compareParams = (a: any, b: any): boolean => {
	// Handle primitive types and null
	if (a === b) return true;
	if (a === null || b === null) return false;
	if (typeof a !== "object" || typeof b !== "object") return false;

	// Handle arrays
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, index) => compareParams(item, b[index]));
	}

	// Handle objects
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);

	if (keysA.length !== keysB.length) return false;

	return keysA.every((key) => {
		if (!Object.hasOwn(b, key)) return false;
		return compareParams(a[key], b[key]);
	});
};
