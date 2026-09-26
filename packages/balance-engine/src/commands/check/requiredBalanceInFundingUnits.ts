import { Decimal } from "decimal.js";
import type { DeductionContext } from "../../deduction/types/deductionContext.js";
import type { DeductionDelta } from "../../deduction/types/deductionDelta.js";
import type { DeductionRow } from "../../deduction/types/deductionRow.js";
import type { DeductionState } from "../../deduction/types/deductionState.js";
import { deductFromBucket } from "../../deduction/utils/draw/deductFromBucket.js";
import { deductFromRows } from "../../deduction/utils/draw/deductFromRows.js";

const BALANCE_BUCKETS = ["unlimited", "rollovers", "included"] as const;

/** Draws the requirement through the funding feature's balances, then prices whatever is left on its last row. */
const rateCardPrice = ({
	context,
	fundingFeatureId,
	requiredBalance,
	precedingDeltas,
}: {
	context: DeductionContext;
	fundingFeatureId: string;
	requiredBalance: number;
	precedingDeltas: DeductionDelta[];
}): number => {
	const fundsRequirement = (row: DeductionRow) =>
		row.featureId === fundingFeatureId;
	const fundingContext: DeductionContext = {
		...context,
		rows: context.rows.filter(fundsRequirement),
		rolloverRows: context.rolloverRows.filter(fundsRequirement),
	};
	const deductionState: DeductionState = {
		remaining: new Decimal(requiredBalance),
		// Overflow skips caps and spend limits; the balance buckets still stop at zero.
		terms: { overageBehavior: "overflow", enforcesSpendLimit: false },
		deltas: [...precedingDeltas],
		usageWindowConsumed: new Map(),
	};

	for (const bucket of BALANCE_BUCKETS)
		deductFromBucket({ context: fundingContext, deductionState, bucket });
	deductFromRows({
		context: fundingContext,
		deductionState,
		rows: fundingContext.rows.slice(-1),
		bucket: "overage",
	});

	return deductionState.deltas
		.slice(precedingDeltas.length)
		.reduce(
			(credits, delta) => credits.minus(delta.balanceDelta),
			new Decimal(0),
		)
		.toNumber();
};

/**
 * The requirement in the funding feature's units. A rate card prices each row from its own tier position and the last
 * row prices what no balance covers, as legacy `getCreditRateRequiredBalance` does.
 */
export const requiredBalanceInFundingUnits = ({
	context,
	fundingRow,
	requiredBalance,
	precedingDeltas,
}: {
	context: DeductionContext;
	fundingRow: DeductionRow | undefined;
	requiredBalance: number;
	/** Deltas already on the rows before the check's own draw, such as the track a check follows. */
	precedingDeltas: DeductionDelta[];
}): number => {
	const pricedByRateCard =
		fundingRow !== undefined &&
		requiredBalance > 0 &&
		context.rows.some(
			(row) => row.featureId === fundingRow.featureId && row.rateCard !== null,
		);
	if (!pricedByRateCard)
		return new Decimal(requiredBalance)
			.mul(fundingRow?.creditCost ?? 1)
			.toNumber();

	return rateCardPrice({
		context,
		fundingFeatureId: fundingRow.featureId,
		requiredBalance,
		precedingDeltas,
	});
};
