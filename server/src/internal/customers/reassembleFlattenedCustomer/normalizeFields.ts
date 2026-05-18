export const toTimestamp = (value: unknown): number => {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? Date.now() : parsed;
	}
	return Date.now();
};

export const toNullableTimestamp = (value: unknown): number | null => {
	if (value === null || value === undefined) return null;
	return toTimestamp(value);
};

export const toFloat = (value: unknown): number => {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = parseFloat(value);
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return 0;
};

export const toInt = (value: unknown, fallback = 1): number => {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? fallback : parsed;
	}
	return fallback;
};
