import type { DeductionOutcome } from "../types/deductionOutcome.js";
import type { DeductionRow } from "../types/deductionRow.js";

/** The row an answer is reported against: the first one drawn, else the first one that could have been (a credit system's, say). */
export const fundingRowOf = ({
	outcome,
}: {
	outcome: DeductionOutcome;
}): DeductionRow | undefined => {
	const rows = [...outcome.context.rows, ...outcome.context.rolloverRows];
	const [firstDelta] = outcome.deltas;
	const drawn = firstDelta
		? rows.find(
				(row) => row.table === firstDelta.table && row.id === firstDelta.id,
			)
		: undefined;
	return drawn ?? outcome.context.rows[0];
};
