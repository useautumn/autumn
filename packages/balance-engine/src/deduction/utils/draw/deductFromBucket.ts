import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionRow } from "../../types/deductionRow.js";
import type { DeductionState } from "../../types/deductionState.js";
import { allowsNegative, isRefund } from "../deductionUtils.js";
import { type DeductionBucket, deductFromRows } from "./deductFromRows.js";

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
		case "overage": {
			const admitsEveryRow =
				allowsNegative({ context }) || isRefund({ deductionState });
			return context.rows.filter((row) => admitsEveryRow || row.usageAllowed);
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
