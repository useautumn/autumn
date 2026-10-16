/**
 * Evaluate a `nullableObjectFilter(...)` value against a field. Mirrors
 * the three-branch shape of the schema:
 *   - bare `null`               → match if value is null/undefined
 *   - `{ $eq: null }`           → same
 *   - `{ $ne: null }`           → match if value is non-null
 *   - inner shape               → value must be non-null AND `innerMatches` returns true
 *
 * `innerMatches` is the caller-supplied nested matcher (e.g. for a
 * nested `PlanItemFilter`). It only sees non-null values.
 */
export const nullableFieldMatches = <TInner>({
	filter,
	value,
	innerMatches,
}: {
	filter: TInner | null | { $eq?: null; $ne?: null } | undefined;
	value: unknown;
	innerMatches: (args: {
		filter: TInner;
		value: NonNullable<unknown>;
	}) => boolean;
}): boolean => {
	if (filter === undefined) return true;

	const isNull = value === null || value === undefined;

	if (filter === null) return isNull;

	if (typeof filter === "object" && filter !== null) {
		if ("$eq" in filter && filter.$eq === null) return isNull;
		if ("$ne" in filter && filter.$ne === null) return !isNull;
		// Anything else with `$eq`/`$ne` keys is shape-invalid for a nullable
		// wrapper — fall through to the inner matcher.
		const onlyNullKeys =
			Object.keys(filter).every((k) => k === "$eq" || k === "$ne") &&
			Object.keys(filter).length > 0;
		if (onlyNullKeys) return true;
	}

	if (isNull) return false;
	return innerMatches({
		filter: filter as TInner,
		value: value as NonNullable<unknown>,
	});
};
