import type { SubjectRowTable, SubjectRowUpdate } from "./subjectRowUpdate.js";

/** One row's move as the committer hands it over: a new row, a change to an existing one, or its removal. */
export type SubjectRowChange =
	| { op: "insert"; table: SubjectRowTable; row: Record<string, unknown> }
	| ({ op: "update" } & SubjectRowUpdate)
	| { op: "delete"; table: SubjectRowTable; id: string }
	| {
			/** Set-based: every share of the pool due by `dueBy` takes its next value; any row count lands. */
			op: "promote";
			table: "pooledContributions";
			pooledBalanceId: string;
			dueBy: number;
	  };

/** Whether a change landed, from the rows its statement touched: a row change touches exactly one, a set-based change however many match. */
export const subjectRowChangeLanded = ({
	change,
	touched,
}: {
	change: SubjectRowChange;
	touched: number;
}): boolean => change.op === "promote" || touched === 1;

/** `customers` and `entities` are keyed on `internal_id`: their `id` is the external id, unique only within an org and env. */
export const subjectRowKeyColumnOf = ({
	table,
}: {
	table: SubjectRowTable;
}): "id" | "internal_id" =>
	table === "customers" || table === "entities" ? "internal_id" : "id";

export const subjectRowIdOf = (change: SubjectRowChange): string => {
	if (change.op === "insert")
		return String(change.row[subjectRowKeyColumnOf({ table: change.table })]);
	if (change.op === "promote") return `promote:${change.pooledBalanceId}`;
	return change.id;
};
