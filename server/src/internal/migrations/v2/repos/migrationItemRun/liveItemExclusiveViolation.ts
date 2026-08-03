const LIVE_ITEM_EXCLUSIVE_INDEX = "migration_item_runs_live_item_exclusive";

const constraintOf = (error: unknown): string | null => {
	if (typeof error !== "object" || error === null) return null;
	const { code, constraint } = error as {
		code?: unknown;
		constraint?: unknown;
	};
	if (code === "23505" && typeof constraint === "string") return constraint;
	return constraintOf((error as { cause?: unknown }).cause ?? null);
};

/** The item is RUNNING in another live migration — the claim lost the
 * select→insert race that the exclusivity index backstops. */
export const isLiveItemExclusiveViolation = (error: unknown): boolean =>
	constraintOf(error) === LIVE_ITEM_EXCLUSIVE_INDEX;
