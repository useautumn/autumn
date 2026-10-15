import type { NumberMatcher } from "../matcher.js";

/**
 * Evaluate a `NumberMatcher` against a value. Returns `true` when the
 * value satisfies the matcher.
 *
 * Implemented operators: bare value, `null` shorthand, `$eq`, `$ne`,
 * `$in`, `$nin`, `$gt`, `$gte`, `$lt`, `$lte`.
 *
 * `null` and `undefined` on the value side are treated identically.
 * Ordering operators (`$gt` etc.) skip null/undefined values (they
 * can't be compared meaningfully — predicate returns `false`).
 */
export const numberMatcherMatches = ({
	matcher,
	value,
}: {
	matcher: NumberMatcher | undefined;
	value: number | null | undefined;
}): boolean => {
	if (matcher === undefined) return true;
	if (matcher === null) return value === null || value === undefined;
	if (typeof matcher === "number") return value === matcher;

	if ("$eq" in matcher && matcher.$eq !== undefined) {
		if (matcher.$eq === null) return value === null || value === undefined;
		if (value !== matcher.$eq) return false;
	}
	if ("$ne" in matcher && matcher.$ne !== undefined) {
		if (matcher.$ne === null) {
			if (value === null || value === undefined) return false;
		} else if (value === matcher.$ne) return false;
	}
	if (matcher.$in && !matcher.$in.includes(value ?? Number.NaN)) return false;
	if (matcher.$nin?.includes(value ?? Number.NaN)) return false;

	const requiresOrdering =
		matcher.$gt !== undefined ||
		matcher.$gte !== undefined ||
		matcher.$lt !== undefined ||
		matcher.$lte !== undefined;
	if (requiresOrdering && (value === null || value === undefined)) return false;

	if (matcher.$gt !== undefined && !((value ?? 0) > matcher.$gt)) return false;
	if (matcher.$gte !== undefined && !((value ?? 0) >= matcher.$gte))
		return false;
	if (matcher.$lt !== undefined && !((value ?? 0) < matcher.$lt)) return false;
	if (matcher.$lte !== undefined && !((value ?? 0) <= matcher.$lte))
		return false;

	return true;
};
