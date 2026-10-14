export const hasCreditDimensionRules = (item: {
	dimensions?: Record<string, unknown> | null;
	multipliers?: Record<string, unknown> | null;
}): boolean =>
	Object.keys(item.dimensions ?? {}).length > 0 ||
	Object.keys(item.multipliers ?? {}).length > 0;
