import { isDeepStrictEqual } from "node:util";
import { IrreversibleChangeError, StaleMutationError } from "../errors.js";
import type {
	RowChange,
	TableRowChange,
} from "../models/mutation/rowChange.js";
import type { AnyRowIncrement } from "../models/mutation/rowIncrement.js";
import type { SubjectState } from "../models/subject/subjectState.js";
import { incrementRow } from "./incrementRow.js";

type StateRow = SubjectState[
	| "customerProducts"
	| "customerPrices"
	| "customerEntitlements"
	| "rollovers"
	| "usageWindows"
	| "pooledBalances"][number];

const rowMatchesAfter = ({
	row,
	after,
}: {
	row: object;
	after: object;
}): boolean =>
	Object.entries(after).every(([field, value]) =>
		isDeepStrictEqual(Reflect.get(row, field), value),
	);

/** Undo one change on one table: inserts come out, updates go back to `before`. A delete carries no row, so it cannot be undone. */
const revertOnTable = <Row extends StateRow>({
	rows,
	change,
}: {
	rows: Row[];
	change: TableRowChange<string, Row> | AnyRowIncrement<Row>;
}): Row[] => {
	switch (change.op) {
		case "insert": {
			const index = rows.findIndex((row) => row.id === change.row.id);
			if (index === -1)
				throw new StaleMutationError({ subject: change.row.id });
			return rows.filter((_, candidate) => candidate !== index);
		}
		case "update": {
			const index = rows.findIndex((row) => row.id === change.id);
			const row = rows[index];
			if (!row || !rowMatchesAfter({ row, after: change.after })) {
				throw new StaleMutationError({ subject: change.id });
			}
			return rows.map((candidate, candidateIndex) =>
				candidateIndex === index ? { ...row, ...change.before } : candidate,
			);
		}
		case "delete":
			throw new IrreversibleChangeError({ subject: change.id });
		case "increment": {
			const index = rows.findIndex((row) => row.id === change.id);
			const row = rows[index];
			if (!row) throw new StaleMutationError({ subject: change.id });
			return rows.map((candidate, candidateIndex) =>
				candidateIndex === index
					? incrementRow({ row, change, direction: -1 })
					: candidate,
			);
		}
	}
};

/** The inverse of `applyChanges`: walks the changes backwards so the rows read as they did before them. */
export const revertChanges = ({
	state,
	changes,
}: {
	state: SubjectState;
	changes: RowChange[];
}): SubjectState => {
	let previousState = state;
	for (const change of [...changes].reverse()) {
		switch (change.table) {
			// The customer row anchors the state; undoing its insert is undoing the state, which revision.before === 0 already says.
			case "customer":
				if (change.op === "insert") break;
				if (
					!rowMatchesAfter({ row: previousState.customer, after: change.after })
				)
					throw new StaleMutationError({ subject: change.id });
				previousState = {
					...previousState,
					customer: { ...previousState.customer, ...change.before },
				};
				break;
			case "entity":
				previousState = { ...previousState, entity: null };
				break;
			case "customerProducts":
				previousState = {
					...previousState,
					customerProducts: revertOnTable({
						rows: previousState.customerProducts,
						change,
					}),
				};
				break;
			case "customerPrices":
				previousState = {
					...previousState,
					customerPrices: revertOnTable({
						rows: previousState.customerPrices,
						change,
					}),
				};
				break;
			case "customerEntitlements":
				previousState = {
					...previousState,
					customerEntitlements: revertOnTable({
						rows: previousState.customerEntitlements,
						change,
					}),
				};
				break;
			case "rollovers":
				previousState = {
					...previousState,
					rollovers: revertOnTable({ rows: previousState.rollovers, change }),
				};
				break;
			case "usageWindows":
				previousState = {
					...previousState,
					usageWindows: revertOnTable({
						rows: previousState.usageWindows,
						change,
					}),
				};
				break;
			case "pooledBalances":
				previousState = {
					...previousState,
					pooledBalances: revertOnTable({
						rows: previousState.pooledBalances,
						change,
					}),
				};
				break;
			case "pooledContributions":
				break;
			case "locks":
				// A deleted lock's id is gone from memory, so only the insert can be walked back.
				if (change.op === "delete")
					throw new IrreversibleChangeError({ subject: change.id });
				previousState = {
					...previousState,
					openLocks: previousState.openLocks.filter(
						(openLock) => openLock.id !== change.row.id,
					),
				};
				break;
		}
	}
	return previousState;
};
