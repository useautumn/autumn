import type { MeterState } from "./meterState.js";

const canonicalize = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value === null || typeof value !== "object") return value;

	const source = value as Record<string, unknown>;
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(source).sort()) {
		sorted[key] = canonicalize(source[key]);
	}
	return sorted;
};

export const canonicalSerialize = ({ state }: { state: MeterState }): string =>
	JSON.stringify(canonicalize(state));
