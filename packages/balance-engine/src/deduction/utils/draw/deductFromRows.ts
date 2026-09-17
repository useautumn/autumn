import { creditRateToCost } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionDelta } from "../../types/deductionDelta.js";
import type { DeductionRow } from "../../types/deductionRow.js";
import type { DeductionState } from "../../types/deductionState.js";
import { allowsNegative, isRefund } from "../classifyDeductionUtils.js";
import {
	deductionRowToCurrentBalance,
	deductionRowToRateUnits,
} from "../convertDeductionUtils.js";
import { creditRateUnitsForCreditChange } from "../credits/creditRateUnitsForCreditChange.js";
import { deductionRowToSpendLimitHeadroom } from "../limits/spendLimit.js";
import {
	consumeUsageWindows,
	deductionRowToUsageWindowHeadroom,
} from "../limits/usageWindows.js";
import { clampChange } from "./clampChange.js";

export type DeductionBucket =
	| "unlimited"
	| "rollovers"
	| "included"
	| "overage";

/** The floor a deduction and the ceiling a refund respect on this row in this bucket. */
const boundsOf = ({
	row,
	bucket,
	context,
}: {
	row: DeductionRow;
	bucket: DeductionBucket;
	context: DeductionContext;
}): { floor: number | null; ceiling: number | null } => {
	switch (bucket) {
		case "unlimited":
			return { floor: null, ceiling: null };
		case "rollovers":
		case "included":
			return { floor: 0, ceiling: 0 };
		case "overage":
			return {
				floor: allowsNegative({ context }) ? null : row.minBalance,
				ceiling: row.maxBalance,
			};
	}
};

/** A delta is what was added to the column, so a deduction records the change negated. */
const changeToDelta = ({
	row,
	change,
	unitsGiven,
}: {
	row: DeductionRow;
	change: Decimal;
	unitsGiven: Decimal;
}): DeductionDelta => ({
	table: row.table,
	id: row.id,
	balanceDelta: change.neg().toNumber(),
	usageDelta: row.table === "rollovers" ? change.toNumber() : 0,
	valueDelta: unitsGiven.neg().toNumber(),
	creditCost: unitsGiven.isZero()
		? row.creditCost
		: change.div(unitsGiven).toNumber(),
	...(row.rateCard
		? {
				usageAttributionDelta: {
					customerEntitlementId: row.ownerId,
					key: row.rateCard.source_internal_feature_id,
					units: unitsGiven.toNumber(),
					credits: change.toNumber(),
				},
			}
		: {}),
});

/** Credits `units` cost on this row: a flat cost, or the rate card's tiers from the units already charged to it. */
const creditsFor = ({
	context,
	row,
	units,
	deductionState,
}: {
	context: DeductionContext;
	row: DeductionRow;
	units: Decimal;
	deductionState: DeductionState;
}): Decimal =>
	row.rateCard
		? new Decimal(
				creditRateToCost({
					featureId: context.featureId,
					creditSystemId: row.featureId,
					rate: row.rateCard,
					amount: units.toNumber(),
					currentUsage: deductionRowToRateUnits({
						row,
						deltas: deductionState.deltas,
					}).toNumber(),
				}),
			)
		: units.times(row.creditCost);

/** The units a credit change pays for: the inverse of `creditsFor`. */
const unitsFor = ({
	row,
	units,
	change,
	deductionState,
}: {
	row: DeductionRow;
	units: Decimal;
	change: Decimal;
	deductionState: DeductionState;
}): Decimal =>
	row.rateCard
		? creditRateUnitsForCreditChange({
				rateCard: row.rateCard,
				currentUnits: deductionRowToRateUnits({
					row,
					deltas: deductionState.deltas,
				}),
				requestedUnits: units,
				allowedCreditChange: change,
			})
		: change.div(row.creditCost);

/** One pass in order: each row gives what the bucket allows until nothing remains. */
export const deductFromRows = ({
	context,
	deductionState,
	rows,
	bucket,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	rows: DeductionRow[];
	bucket: DeductionBucket;
}): void => {
	for (const row of rows) {
		if (deductionState.remaining.isZero()) return;

		const bounds = boundsOf({ row, bucket, context });
		const refund = isRefund({ deductionState });

		// Windowed caps bound how many tracked units this row may give; a refund is never capped.
		const windowRow = bucket === "rollovers" ? null : row;
		const windowHeadroom = refund
			? null
			: deductionRowToUsageWindowHeadroom({
					context,
					deductionState,
					row: windowRow,
				});

		if (windowHeadroom?.isZero()) continue;

		const units = windowHeadroom
			? Decimal.min(deductionState.remaining, windowHeadroom)
			: deductionState.remaining;

		// A spend limit caps the overage bucket in place of the row's floor, as the Lua gate does.
		const headroom =
			bucket === "overage" && !refund
				? deductionRowToSpendLimitHeadroom({ context, deductionState, row })
				: null;
		const amount = creditsFor({ context, row, units, deductionState });
		if (amount.abs().lte(1e-10)) continue;

		const change = clampChange({
			current: deductionRowToCurrentBalance({
				row,
				deltas: deductionState.deltas,
			}),
			amount: headroom ? Decimal.min(amount, headroom) : amount,
			floor: headroom ? null : bounds.floor,
			ceiling: bounds.ceiling,
		});

		if (change.isZero()) continue;

		const unitsGiven = unitsFor({ row, units, change, deductionState });
		deductionState.deltas.push(changeToDelta({ row, change, unitsGiven }));
		deductionState.remaining = deductionState.remaining.minus(unitsGiven);
		consumeUsageWindows({
			context,
			deductionState,
			row: windowRow,
			units: unitsGiven,
		});
	}
};
