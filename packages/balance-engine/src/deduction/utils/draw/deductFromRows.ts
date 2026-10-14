import { creditRateToCost } from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	allocationHeadroomOf,
	consumeAllocation,
} from "../../../allocations/allocationDraw.js";
import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionDelta } from "../../types/deductionDelta.js";
import type { DeductionRow } from "../../types/deductionRow.js";
import type { DeductionState } from "../../types/deductionState.js";
import {
	allowsNegative,
	isFreeRow,
	isRefund,
} from "../classifyDeductionUtils.js";
import {
	deductionRowToCurrentBalance,
	deductionRowToRateUnits,
} from "../convertDeductionUtils.js";
import {
	CREDIT_RATE_EPSILON,
	creditRateUnitsForCreditChange,
} from "../credits/creditRateUnitsForCreditChange.js";
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

const boundsOf = ({
	row,
	bucket,
	deductionState,
}: {
	row: DeductionRow;
	bucket: DeductionBucket;
	deductionState: DeductionState;
}): { floor: number | null; ceiling: number | null } => {
	switch (bucket) {
		case "unlimited":
			return { floor: null, ceiling: null };
		case "rollovers":
		case "included":
			return { floor: 0, ceiling: 0 };
		case "overage":
			return {
				floor: allowsNegative({ deductionState }) ? null : row.minBalance,
				ceiling: allowsNegative({ deductionState }) ? null : row.maxBalance,
			};
	}
};

const toNumber = (value: Decimal): number =>
	value.isZero() ? 0 : value.toNumber();

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
	entityKey: row.entityKey,
	balanceDelta: toNumber(change.neg()),
	usageDelta: row.table === "rollovers" ? toNumber(change) : 0,
	valueDelta: toNumber(unitsGiven.neg()),
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
					featureId: context.selection.featureId,
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

		const bounds = boundsOf({ row, bucket, deductionState });
		const refund = isRefund({ deductionState });

		const windowRow = bucket === "rollovers" ? null : row;
		const windowHeadroom =
			refund || allowsNegative({ deductionState })
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

		if (isFreeRow({ row })) {
			if (refund && bucket !== "overage") continue;
			deductionState.deltas.push(
				changeToDelta({ row, change: new Decimal(0), unitsGiven: units }),
			);
			deductionState.remaining = deductionState.remaining.minus(units);
			consumeUsageWindows({
				context,
				deductionState,
				row: windowRow,
				units,
				credits: new Decimal(0),
			});
			continue;
		}

		const headroom =
			bucket === "overage" && !refund && deductionState.terms.enforcesSpendLimit
				? deductionRowToSpendLimitHeadroom({ context, deductionState, row })
				: null;
		const currentBalance = deductionRowToCurrentBalance({
			row,
			deltas: deductionState.deltas,
		});
		const allocationHeadroom = refund
			? null
			: allocationHeadroomOf({ context, deductionState, row });
		const gatesThisDraw =
			allocationHeadroom !== null &&
			allocationHeadroom.lt(Decimal.max(0, currentBalance));
		if (gatesThisDraw && allocationHeadroom.isZero()) continue;
		const drawable = creditsFor({ context, row, units, deductionState });
		const amount = gatesThisDraw
			? Decimal.min(drawable, allocationHeadroom)
			: drawable;
		const change = clampChange({
			current: currentBalance,
			amount: headroom ? Decimal.min(amount, headroom) : amount,
			floor: headroom ? null : bounds.floor,
			ceiling: bounds.ceiling,
		});

		const unitsGiven = unitsFor({ row, units, change, deductionState });
		if (unitsGiven.abs().lte(CREDIT_RATE_EPSILON)) continue;
		consumeAllocation({
			context,
			deductionState,
			row,
			credits: change.gt(0)
				? Decimal.min(change, Decimal.max(0, currentBalance))
				: change,
		});
		deductionState.deltas.push(changeToDelta({ row, change, unitsGiven }));
		deductionState.remaining = deductionState.remaining.minus(unitsGiven);
		consumeUsageWindows({
			context,
			deductionState,
			row: windowRow,
			units: unitsGiven,
			credits: change,
		});
	}
};
