import { sightUnknownInput } from "@autumn/balance-engine";
import {
	isSubjectRowColumn,
	type SubjectRowChange,
	type SubjectRowTable,
} from "@autumn/postgres";

const knownColumnsOf = <Value>({
	table,
	fields,
}: {
	table: SubjectRowTable;
	fields: Record<string, Value>;
}): Record<string, Value> =>
	Object.fromEntries(
		Object.entries(fields).filter(([column]) => {
			if (isSubjectRowColumn({ table, column })) return true;
			sightUnknownInput({
				key: `rowColumn=${table}.${column}`,
				input: { kind: "row_column", table, column },
			});
			return false;
		}),
	);

/** A newer build's column is dropped before the SQL is built: this build's table does not have it, so the row lands without it. */
export const keepKnownColumns = ({
	change,
}: {
	change: SubjectRowChange;
}): SubjectRowChange => {
	const { table } = change;
	switch (change.op) {
		case "insert":
			return { ...change, row: knownColumnsOf({ table, fields: change.row }) };
		case "update":
			return {
				...change,
				set: knownColumnsOf({ table, fields: change.set }),
				add: knownColumnsOf({ table, fields: change.add }),
				addEntries: knownColumnsOf({ table, fields: change.addEntries }),
				guard: knownColumnsOf({ table, fields: change.guard }),
			};
		default:
			return change;
	}
};
