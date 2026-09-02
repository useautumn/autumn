const sortKeysDeep = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(sortKeysDeep);
	if (value === null || typeof value !== "object") return value;

	const sortedEntries = Object.entries(value as Record<string, unknown>)
		.filter(([, entry]) => entry !== undefined)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, entry]) => [key, sortKeysDeep(entry)]);
	return Object.fromEntries(sortedEntries);
};

const stableJson = (value: unknown): string =>
	JSON.stringify(sortKeysDeep(value ?? {}));

/** Structural equality of an item's dimension and multiplier rules; record order is not semantic. */
export const creditDimensionRulesEqual = ({
	left,
	right,
}: {
	left: { dimensions?: unknown; multipliers?: unknown };
	right: { dimensions?: unknown; multipliers?: unknown };
}): boolean =>
	stableJson(left.dimensions) === stableJson(right.dimensions) &&
	stableJson(left.multipliers) === stableJson(right.multipliers);
