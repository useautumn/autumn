import type { DeductionContext } from "./types/deductionContext.js";
import type { DeductionRow } from "./types/deductionRow.js";

/** The context with `reserved` units held back from its positive balances in draw order; changes stay increments on the real rows. */
export const reserveDeductionContext = ({
	context,
	reserved,
}: {
	context: DeductionContext;
	reserved: number;
}): DeductionContext => {
	if (reserved <= 0) return context;
	let left = reserved;
	const hold = (row: DeductionRow): DeductionRow => {
		if (left <= 0 || row.balance <= 0) return row;
		const held = Math.min(left, row.balance);
		left -= held;
		return { ...row, balance: row.balance - held };
	};
	const rolloverRows = context.rolloverRows.map(hold);
	const rows = context.rows.map(hold);
	return { ...context, rows, rolloverRows };
};
