export const getAxiomMatchData = (
	result: unknown,
): Record<string, unknown>[] =>
	result && typeof result === "object" && "matches" in result
		? (
				(result as { matches?: Array<{ data?: Record<string, unknown> }> })
					.matches ?? []
			).flatMap((match) => (match.data ? [match.data] : []))
		: [];

export const axiomNumberFrom = (value: unknown) => {
	if (typeof value === "number") return value;
	if (typeof value === "string") return Number(value.replace(/,/g, ""));
	return 0;
};

export const axiomStringFrom = (value: unknown) =>
	typeof value === "string" ? value : "";
