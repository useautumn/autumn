import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";

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
