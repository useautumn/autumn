import type { SubjectRowTable, SubjectRowUpdate } from "./subjectRowUpdate.js";

/** One row's move as the committer hands it over: a new row, a change to an existing one, or its removal. */
export type SubjectRowChange =
	| { op: "insert"; table: SubjectRowTable; row: Record<string, unknown> }
	| ({ op: "update" } & SubjectRowUpdate)
	| { op: "delete"; table: SubjectRowTable; id: string };

export const subjectRowIdOf = (change: SubjectRowChange): string =>
	change.op === "insert" ? String(change.row.id) : change.id;
