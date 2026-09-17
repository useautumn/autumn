import { isDeepStrictEqual } from "node:util";
import { StaleMutationError } from "../errors.js";
import type { RowChange, TableRowChange } from "../models/rowChange.js";
import type { SubjectState } from "../models/subjectState.js";

type StateRow = SubjectState[RowChange["table"]][number];

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
	change: TableRowChange<string, Row>;
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
			case "customerProducts":
				nextState = {
					...nextState,
					customerProducts: applyToTable({
						rows: nextState.customerProducts,
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
		}
	}
	return nextState;
};
