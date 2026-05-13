import type { StringMatcher } from "../matcher.js";

/**
 * Evaluate a `StringMatcher` against a value. Returns `true` when the
 * value satisfies the matcher.
 *
 * Implemented operators: bare value (equality), `null` shorthand,
 * `$eq`, `$ne`, `$in`, `$nin`. `$regex` / `$startsWith` throw — explicit
 * gap signal so callers see what's missing instead of silently passing.
 *
 * `null` and `undefined` on the value side are treated identically.
 */
export const stringMatcherMatches = ({
	matcher,
	value,
}: {
	matcher: StringMatcher | undefined;
	value: string | null | undefined;
}): boolean => {
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
	if (matcher.$nin?.includes(value ?? "")) return false;

	const unsupported = ["$regex", "$startsWith"] as const;
	for (const op of unsupported) {
		if (op in matcher && (matcher as Record<string, unknown>)[op] !== undefined)
			throw new Error(`stringMatcherMatches: operator ${op} not supported yet`);
	}
	return true;
};
