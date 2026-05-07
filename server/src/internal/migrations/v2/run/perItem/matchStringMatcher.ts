import type { StringMatcher } from "@autumn/shared";

/** Phase 1 ops only: bare value, $eq, $ne, $in, $nin. */
export const matchStringMatcher = (
	matcher: StringMatcher | undefined,
	value: string | null | undefined,
): boolean => {
	if (matcher === undefined) return true;
	if (matcher === null) return value === null || value === undefined;
	if (typeof matcher === "string") return value === matcher;

	if ("$eq" in matcher && matcher.$eq !== undefined) {
		if (matcher.$eq === null) return value === null || value === undefined;
		if (value !== matcher.$eq) return false;
	}
	if ("$ne" in matcher && matcher.$ne !== undefined) {
		if (matcher.$ne === null) {
			if (value === null || value === undefined) return false;
		} else if (value === matcher.$ne) return false;
	}
	if (matcher.$in && !matcher.$in.includes(value ?? "")) return false;
	if (matcher.$nin && matcher.$nin.includes(value ?? "")) return false;

	const unsupported = ["$regex", "$startsWith"] as const;
	for (const op of unsupported) {
		if (op in matcher && (matcher as Record<string, unknown>)[op] !== undefined)
			throw new Error(
				`matchStringMatcher: operator ${op} not supported in JS matcher yet`,
			);
	}
	return true;
};
