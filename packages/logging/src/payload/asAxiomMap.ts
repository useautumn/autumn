export const asAxiomMap = ({
	value,
}: {
	value: unknown;
}): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: { value };
