import type { ExpectedColumns } from "../types/billingPlanOp.js";

export const rowHoldsExpectedColumns = ({
	row,
	expect,
}: {
	row: object;
	expect?: ExpectedColumns;
}): boolean =>
	Object.entries(expect ?? {}).every(
		([column, value]) => Reflect.get(row, column) === value,
	);
