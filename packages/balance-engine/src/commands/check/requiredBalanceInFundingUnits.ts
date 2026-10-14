import { Decimal } from "decimal.js";
import type { DeductionContext } from "../../deduction/types/deductionContext.js";
import type { DeductionDelta } from "../../deduction/types/deductionDelta.js";
import type { DeductionRow } from "../../deduction/types/deductionRow.js";
import type { DeductionState } from "../../deduction/types/deductionState.js";
import { deductFromBucket } from "../../deduction/utils/draw/deductFromBucket.js";
import { deductFromRows } from "../../deduction/utils/draw/deductFromRows.js";

const BALANCE_BUCKETS = ["unlimited", "rollovers", "included"] as const;

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

export const requiredBalanceInFundingUnits = ({
	context,
	fundingRow,
	requiredBalance,
	precedingDeltas,
}: {
	context: DeductionContext;
	fundingRow: DeductionRow | undefined;
	requiredBalance: number;
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
