import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionRow } from "../../types/deductionRow.js";
import type { DeductionState } from "../../types/deductionState.js";
import {
	allowsNegative,
	isRefund,
	isUsageAllowed,
} from "../classifyDeductionUtils.js";
import { type DeductionBucket, deductFromRows } from "./deductFromRows.js";

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
		case "unlimited": {
			const [firstRow] = context.rows;
			return firstRow?.unlimited ? [firstRow] : [];
		}
		case "rollovers":
			return isRefund({ deductionState }) ? [] : context.rolloverRows;
		case "included":
			return context.rows;
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
