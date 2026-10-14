import type { SubjectRowTable, SubjectRowUpdate } from "./subjectRowUpdate.js";

export type SubjectRowChange =
	| { op: "insert"; table: SubjectRowTable; row: Record<string, unknown> }
	| ({ op: "update" } & SubjectRowUpdate)
	| { op: "delete"; table: SubjectRowTable; id: string }
	| {
			op: "promote";
			table: "pooledContributions";
			pooledBalanceId: string;
			dueBy: number;
	  };

export const subjectRowChangeLanded = ({
	change,
	touched,
}: {
	change: SubjectRowChange;
	touched: number;
}): boolean => change.op === "promote" || touched === 1;

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
