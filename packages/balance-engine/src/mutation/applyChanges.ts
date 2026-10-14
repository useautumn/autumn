import { isDeepStrictEqual } from "node:util";
import { StaleMutationError } from "../errors.js";
import type {
	CustomerRowChange,
	LockRowChange,
	RowChange,
	TableRowChange,
} from "../models/mutation/rowChange.js";
import type { AnyRowIncrement } from "../models/mutation/rowIncrement.js";
import type { WorkerCustomer } from "../models/subject/rows/workerCustomer.js";
import type { OpenLock } from "../models/subject/rows/workerLock.js";
import type { SubjectState } from "../models/subject/subjectState.js";
import { incrementRow } from "./incrementRow.js";

type StateRow = SubjectState[
	| "customerProducts"
	| "customerPrices"
	| "customerEntitlements"
	| "rollovers"
	| "usageWindows"
	| "pooledBalances"][number];

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

/** An update must name the subject's own customer and find the columns it read still in place. */
const applyToCustomer = ({
	customer,
	change,
}: {
	customer: WorkerCustomer;
	change: CustomerRowChange;
}): WorkerCustomer => {
	if (change.op === "insert") return change.row;
	const isSameCustomer = customer.internal_id === change.id;
	if (
		!isSameCustomer ||
		!rowMatchesBefore({ row: customer, before: change.before })
	)
		throw new StaleMutationError({ subject: change.id });
	return { ...customer, ...change.after };
};

/** Memory keeps only the ids of an open lock; the row the change carries is for Postgres. */
const applyToOpenLocks = ({
	openLocks,
	change,
}: {
	openLocks: OpenLock[];
	change: LockRowChange;
}): OpenLock[] => {
	if (change.op === "insert") {
		const { id, lock_id } = change.row;
		const isAlreadyOpen = openLocks.some(
			(openLock) => openLock.id === id || openLock.lock_id === lock_id,
		);
		if (isAlreadyOpen) throw new StaleMutationError({ subject: id });
		return [...openLocks, { id, lock_id }];
	}
	const remaining = openLocks.filter((openLock) => openLock.id !== change.id);
	if (remaining.length === openLocks.length)
		throw new StaleMutationError({ subject: change.id });
	return remaining;
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
				nextState = {
					...nextState,
					customer: applyToCustomer({ customer: nextState.customer, change }),
				};
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
			case "pooledBalances":
				nextState = {
					...nextState,
					pooledBalances: applyToTable({
						rows: nextState.pooledBalances,
						change,
					}),
				};
				break;
			case "pooledContributions":
				break;
			case "locks":
				nextState = {
					...nextState,
					openLocks: applyToOpenLocks({
						openLocks: nextState.openLocks,
						change,
					}),
				};
				break;
		}
	}
	return nextState;
};
