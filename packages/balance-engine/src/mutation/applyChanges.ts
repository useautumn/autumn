import { isDeepStrictEqual } from "node:util";
import { StaleMutationError } from "../errors.js";
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
	| "usageWindows"][number];

const rowIdOf = ({ row }: { row: StateRow }): string => row.id;

const rowMatchesBefore = ({
	row,
	before,
}: {
	row: object;
	before: object;
}): boolean => {
	return Object.entries(before).every(([field, value]) =>
		isDeepStrictEqual(Reflect.get(row, field), value),
	);
};

const applyToTable = <Row extends StateRow>({
	rows,
	change,
}: {
	rows: Row[];
	change: TableRowChange<string, Row> | AnyRowIncrement<Row>;
}): Row[] => {
	const indexOfId = (id: string) =>
		rows.findIndex((row) => rowIdOf({ row }) === id);

	switch (change.op) {
		case "insert": {
			const id = rowIdOf({ row: change.row });
			if (indexOfId(id) !== -1) throw new StaleMutationError({ subject: id });
			return [...rows, change.row];
		}
		case "update": {
			const index = indexOfId(change.id);
			const row = rows[index];
			if (!row || !rowMatchesBefore({ row, before: change.before })) {
				throw new StaleMutationError({ subject: change.id });
			}
			return rows.map((candidate, candidateIndex) =>
				candidateIndex === index ? { ...row, ...change.after } : candidate,
			);
		}
		case "delete": {
			const index = indexOfId(change.id);
			if (index === -1) throw new StaleMutationError({ subject: change.id });
			return rows.filter((_, candidate) => candidate !== index);
		}
		// An add needs the row to exist and to still be the cycle the guard names; its counters may hold anything.
		case "increment": {
			const index = indexOfId(change.id);
			const row = rows[index];
			if (!row || !rowMatchesBefore({ row, before: change.guard ?? {} })) {
				throw new StaleMutationError({ subject: change.id });
			}
			return rows.map((candidate, candidateIndex) =>
				candidateIndex === index ? incrementRow({ row, change }) : candidate,
			);
		}
	}
};

/** Generic over the change list: it never knows which command produced the changes. */
export const applyChanges = ({
	state,
	changes,
}: {
	state: SubjectState;
	changes: RowChange[];
}): SubjectState => {
	let nextState = state;
	for (const change of changes) {
		switch (change.table) {
			case "customer":
				nextState = { ...nextState, customer: change.row };
				break;
			case "entity":
				nextState = { ...nextState, entity: change.row };
				break;
			case "customerProducts":
				nextState = {
					...nextState,
					customerProducts: applyToTable({
						rows: nextState.customerProducts,
						change,
					}),
				};
				break;
			case "customerPrices":
				nextState = {
					...nextState,
					customerPrices: applyToTable({
						rows: nextState.customerPrices,
						change,
					}),
				};
				break;
			case "customerEntitlements":
				nextState = {
					...nextState,
					customerEntitlements: applyToTable({
						rows: nextState.customerEntitlements,
						change,
					}),
				};
				break;
			case "rollovers":
				nextState = {
					...nextState,
					rollovers: applyToTable({ rows: nextState.rollovers, change }),
				};
				break;
			case "usageWindows":
				nextState = {
					...nextState,
					usageWindows: applyToTable({ rows: nextState.usageWindows, change }),
				};
				break;
		}
	}
	return nextState;
};
