import { Decimal } from "decimal.js";
import type { RowChange } from "../../models/mutation/rowChange.js";
import type { DeductionContext } from "../types/deductionContext.js";
import type { DeductionDelta } from "../types/deductionDelta.js";
import type { DeductionRow } from "../types/deductionRow.js";
import type { DeductionState } from "../types/deductionState.js";

export const isRefund = ({
	deductionState,
}: {
	deductionState: DeductionState;
}): boolean => deductionState.remaining.lt(0);

/** "overflow" drops the floors; "cap" and "reject" keep them. */
export const allowsNegative = ({
	context,
}: {
	context: DeductionContext;
}): boolean => context.overageBehavior === "overflow";

const deltasOn = ({
	row,
	deltas,
}: {
	row: Pick<DeductionRow, "table" | "id">;
	deltas: DeductionDelta[];
}): DeductionDelta[] =>
	deltas.filter((delta) => delta.table === row.table && delta.id === row.id);

const sumOf = (values: number[]): Decimal =>
	values.reduce((total, value) => total.plus(value), new Decimal(0));

/** The row's balance as the buckets so far have left it: stored plus every delta on it. */
export const currentBalanceOf = ({
	row,
	deltas,
}: {
	row: DeductionRow;
	deltas: DeductionDelta[];
}): Decimal =>
	new Decimal(row.balance).plus(
		sumOf(deltasOn({ row, deltas }).map((delta) => delta.balanceDelta)),
	);

/** Deltas are the log; a row change folds every delta on one row into before → after. */
export const deltasToRowChanges = ({
	context,
	deltas,
}: {
	context: DeductionContext;
	deltas: DeductionDelta[];
}): RowChange[] => {
	const changes: RowChange[] = [];

	for (const { id, balance } of context.customerEntitlements) {
		const rowDeltas = deltasOn({
			row: { table: "customerEntitlements", id },
			deltas,
		});
		if (rowDeltas.length === 0) continue;
		changes.push({
			table: "customerEntitlements",
			op: "update",
			id,
			before: { balance },
			after: {
				balance: sumOf([
					balance,
					...rowDeltas.map((d) => d.balanceDelta),
				]).toNumber(),
			},
		});
	}

	for (const { id, balance, usage } of context.rollovers) {
		const rowDeltas = deltasOn({ row: { table: "rollovers", id }, deltas });
		if (rowDeltas.length === 0) continue;
		changes.push({
			table: "rollovers",
			op: "update",
			id,
			before: { balance, usage },
			after: {
				balance: sumOf([
					balance,
					...rowDeltas.map((d) => d.balanceDelta),
				]).toNumber(),
				usage: sumOf([usage, ...rowDeltas.map((d) => d.usageDelta)]).toNumber(),
			},
		});
	}

	return changes;
};
