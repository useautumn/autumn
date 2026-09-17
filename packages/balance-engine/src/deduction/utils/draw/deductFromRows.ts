import type { Decimal } from "decimal.js";
import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionDelta } from "../../types/deductionDelta.js";
import type { DeductionRow } from "../../types/deductionRow.js";
import type { DeductionState } from "../../types/deductionState.js";
import { allowsNegative, currentBalanceOf } from "../deductionUtils.js";
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
}: {
	row: DeductionRow;
	change: Decimal;
}): DeductionDelta => ({
	table: row.table,
	id: row.id,
	balanceDelta: change.neg().toNumber(),
	usageDelta: row.table === "rollovers" ? change.toNumber() : 0,
	valueDelta: change.div(row.creditCost).neg().toNumber(),
	creditCost: row.creditCost,
});

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

		const { floor, ceiling } = boundsOf({ row, bucket, context });

		const change = clampChange({
			current: currentBalanceOf({ row, deltas: deductionState.deltas }),
			amount: deductionState.remaining.times(row.creditCost),
			floor,
			ceiling,
		});

		if (change.isZero()) continue;

		deductionState.deltas.push(changeToDelta({ row, change }));
		deductionState.remaining = deductionState.remaining.minus(
			change.div(row.creditCost),
		);
	}
};
