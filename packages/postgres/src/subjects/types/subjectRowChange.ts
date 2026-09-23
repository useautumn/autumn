import type { SubjectRowTable, SubjectRowUpdate } from "./subjectRowUpdate.js";

/** One row's move as the committer hands it over: a new row, a change to an existing one, or its removal. */
export type SubjectRowChange =
	| { op: "insert"; table: SubjectRowTable; row: Record<string, unknown> }
	| ({ op: "update" } & SubjectRowUpdate)
	| { op: "delete"; table: SubjectRowTable; id: string };

/** `customers` and `entities` are keyed on `internal_id`: their `id` is the external id, unique only within an org and env. */
export const subjectRowKeyColumnOf = ({
	table,
}: {
	table: SubjectRowTable;
}): "id" | "internal_id" =>
	table === "customers" || table === "entities" ? "internal_id" : "id";

export const subjectRowIdOf = (change: SubjectRowChange): string =>
	change.op === "insert"
		? String(change.row[subjectRowKeyColumnOf({ table: change.table })])
		: change.id;
