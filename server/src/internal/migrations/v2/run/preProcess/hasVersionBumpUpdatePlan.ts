import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";

/**
 * True iff at least one update_plan op bumps `version` without already
 * specifying a `plan_filter.custom` predicate. Drives the default
 * is_custom guard injected by `preProcessMigration`.
 */
export const hasVersionBumpUpdatePlan = (
	operations: Operations | null | undefined,
) =>
	Boolean(
		operations?.customer?.some(
			(op) =>
				op.type === "update_plan" &&
				op.version !== undefined &&
				op.plan_filter.custom === undefined,
		),
	);
