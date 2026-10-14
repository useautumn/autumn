export type ScalarConstraint = boolean | null | "unsupported";

export const lowerBooleanMatcher = (raw: unknown): ScalarConstraint => {
	if (raw === undefined) return null;
	if (typeof raw === "boolean") return raw;
	if (typeof raw === "object" && raw !== null && "$eq" in raw) {
		const value = (raw as { $eq?: unknown }).$eq;
		if (typeof value === "boolean") return value;
	}
	return "unsupported";
};

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
