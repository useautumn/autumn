import { Decimal } from "decimal.js";
import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionRow } from "../../types/deductionRow.js";
import type { DeductionState } from "../../types/deductionState.js";
import { deductionRowToCurrentBalance } from "../convertDeductionUtils.js";

/** `get_available_overage_from_spend_limit`: the feature's cap minus what its rows already carry below zero; null when the feature has no limit. */
export const deductionRowToSpendLimitHeadroom = ({
	context,
	deductionState,
	row,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	row: DeductionRow;
}): Decimal | null => {
	const overageLimit = context.spendLimitByFeatureId[row.featureId];
	if (overageLimit === undefined) return null;
	const overage = context.rows
		.filter((candidate) => candidate.featureId === row.featureId)
		.reduce(
			(total, candidate) =>
				total.plus(
					Decimal.max(
						deductionRowToCurrentBalance({
							row: candidate,
							deltas: deductionState.deltas,
						}).neg(),
						0,
					),
				),
			new Decimal(0),
		);
	return Decimal.max(new Decimal(overageLimit).minus(overage), 0);
};
