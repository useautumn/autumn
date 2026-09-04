/** True when a rate-card item carries dimensions or multipliers, in API or DB shape. */
export const hasCreditDimensionRules = (item: {
	dimensions?: Record<string, unknown> | null;
	multipliers?: Record<string, unknown> | null;
}): boolean =>
	Object.keys(item.dimensions ?? {}).length > 0 ||
	Object.keys(item.multipliers ?? {}).length > 0;
