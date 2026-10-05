import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionRow } from "../../types/deductionRow.js";
import type { DeductionState } from "../../types/deductionState.js";
import {
	allowsNegative,
	isRefund,
	isUsageAllowed,
} from "../classifyDeductionUtils.js";
import { type DeductionBucket, deductFromRows } from "./deductFromRows.js";

/** Overage pass order: a row's own overage (a usage price) first, then a free allocated grant, then rows only the draw's terms let go negative. */
const overagePriorityOf = ({
	row,
	deductionState,
}: {
	row: DeductionRow;
	deductionState: DeductionState;
}): number => {
	if (row.usageAllowed) return 0;
	if (isUsageAllowed({ row, deductionState })) return 1;
	return 2;
};

/** Which rows a bucket visits; deductFromRows knows how far the bucket lets them move. */
const bucketToRows = ({
	context,
	deductionState,
	bucket,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	bucket: DeductionBucket;
}): DeductionRow[] => {
	switch (bucket) {
		// An unlimited row leads and absorbs everything; its balance drifts as a usage counter.
		case "unlimited": {
			const [firstRow] = context.rows;
			return firstRow?.unlimited ? [firstRow] : [];
		}
		// Rollovers drain before main balances, soonest-expiring first, never on a refund.
		case "rollovers":
			return isRefund({ deductionState }) ? [] : context.rolloverRows;
		// Every row down to zero; a refund only lifts an overdrawn row back to zero here.
		case "included":
			return context.rows;
		// Rows that may go below zero. Overflow admits every row; a refund lifts every row up to its grant.
		// A draw visits them by overage priority (a stable sort keeps the deduction order within one); a refund keeps the deduction order.
		case "overage": {
			const refund = isRefund({ deductionState });
			const admitsEveryRow = allowsNegative({ deductionState }) || refund;
			const rows = context.rows.filter(
				(row) => admitsEveryRow || isUsageAllowed({ row, deductionState }),
			);
			if (refund) return rows;
			return rows.sort(
				(left, right) =>
					overagePriorityOf({ row: left, deductionState }) -
					overagePriorityOf({ row: right, deductionState }),
			);
		}
	}
};

export const deductFromBucket = ({
	context,
	deductionState,
	bucket,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	bucket: DeductionBucket;
}): void => {
	deductFromRows({
		context,
		deductionState,
		bucket,
		rows: bucketToRows({ context, deductionState, bucket }),
	});
};
