/**
 * The scalar-constraint algebra the operation scope is built from: lowering
 * plan-filter matcher forms into provable scalars, and reconciling the two
 * filter levels (migration filter + operation plan_filter).
 */

/** `true`/`false` narrow the scope; `null` means "no constraint"; anything
 * the batch lane cannot prove is `unsupported` → per-customer lane. */
export type ScalarConstraint = boolean | null | "unsupported";

/** Boolean matcher → scalar. `{ $eq }` is handled defensively even though
 * BooleanMatcherSchema is currently a bare boolean. */
export const lowerBooleanMatcher = (raw: unknown): ScalarConstraint => {
	if (raw === undefined) return null;
	if (typeof raw === "boolean") return raw;
	if (typeof raw === "object" && raw !== null && "$eq" in raw) {
		const value = (raw as { $eq?: unknown }).$eq;
		if (typeof value === "boolean") return value;
	}
	return "unsupported";
};

/** Null-existence matcher (`price`) → scalar: `null` / `{ $eq: null }` mean
 * "absent" (false), `{ $ne: null }` means "present" (true). */
export const lowerNullExistenceMatcher = (raw: unknown): ScalarConstraint => {
	if (raw === undefined) return null;
	if (raw === null) return false;
	if (typeof raw === "object") {
		const matcher = raw as { $eq?: unknown; $ne?: unknown };
		if ("$ne" in matcher && matcher.$ne === null) return true;
		if ("$eq" in matcher && matcher.$eq === null) return false;
	}
	return "unsupported";
};

/** Both filter levels describe the same rows: null defers to the other
 * level, both-set must agree, disagreement is unprovable. */
export const reconcileConstraints = (
	fromOp: ScalarConstraint,
	fromMigration: ScalarConstraint,
): ScalarConstraint => {
	if (fromOp === "unsupported" || fromMigration === "unsupported")
		return "unsupported";
	if (fromOp === null) return fromMigration;
	if (fromMigration === null) return fromOp;
	return fromOp === fromMigration ? fromOp : "unsupported";
};
