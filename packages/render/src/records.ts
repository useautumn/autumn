export type LooseRecord = Record<string, unknown>;

export const asRecord = (value: unknown): LooseRecord | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as LooseRecord)
		: null;

export const getString = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value.trim() : null;

export const getNumber = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

export const getArray = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];
