import type { LimitType } from "@autumn/shared";
import type { z } from "zod/v4";
import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionState } from "../../types/deductionState.js";
import { isUsageAllowed } from "../classifyDeductionUtils.js";
import { deductionRowToUsageWindowHeadroom } from "./usageWindows.js";

export type DeductionLimitType = z.infer<typeof LimitType>;

/** A windowed cap is to blame when it leaves fewer units than are still owed, whatever the balance could have covered. */
const isUsageWindowShort = ({
	context,
	deductionState,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
}): boolean =>
	context.rows.some((row) => {
		const headroom = deductionRowToUsageWindowHeadroom({
			context,
			deductionState,
			row,
		});
		return headroom?.lt(deductionState.remaining) ?? false;
	});

/**
 * Which limit left a deduction short, in the order the API's own check names them: a windowed usage cap first,
 * then the allowance when nothing may run over, then the spend limit, which outranks the plan's own overage cap.
 */
export const deductionStateToLimitType = ({
	context,
	deductionState,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
}): DeductionLimitType | null => {
	if (context.rows.length === 0) return null;
	if (isUsageWindowShort({ context, deductionState })) return "usage_limit";

	const overageRows = context.rows.filter((row) =>
		isUsageAllowed({ row, deductionState }),
	);
	if (overageRows.length === 0) return "included";

	const hasSpendLimit = overageRows.some(
		(row) => context.spendLimitByFeatureId[row.featureId] !== undefined,
	);
	return hasSpendLimit ? "spend_limit" : "max_purchase";
};
