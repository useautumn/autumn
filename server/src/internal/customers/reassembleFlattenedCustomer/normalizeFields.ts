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

type RawCustomerProductTimeFields = {
	created_at: unknown;
	starts_at?: unknown;
	canceled_at?: unknown;
	ended_at?: unknown;
	trial_ends_at?: unknown;
	quantity?: unknown;
};

export const normalizeCustomerProductTimeFields = <
	T extends RawCustomerProductTimeFields,
>(
	cp: T,
): T & {
	created_at: number;
	starts_at: number;
	canceled_at: number | null;
	ended_at: number | null;
	trial_ends_at: number | null;
	quantity: number;
} => {
	const created_at = toTimestamp(cp.created_at);
	return Object.assign(cp, {
		created_at,
		starts_at: cp.starts_at ? toTimestamp(cp.starts_at) : created_at,
		canceled_at: toNullableTimestamp(cp.canceled_at),
		ended_at: toNullableTimestamp(cp.ended_at),
		trial_ends_at: toNullableTimestamp(cp.trial_ends_at),
		quantity: toInt(cp.quantity, 1),
	});
};
