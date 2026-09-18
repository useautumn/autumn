import { customerEntitlements, rollovers, usageWindows } from "@autumn/shared";
import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type {
	SubjectRowTable,
	SubjectRowUpdate,
} from "../../types/subjectRowUpdate.js";

/** Balances are numeric read as JS numbers; the engine rounds at 1e-10, so equality is a tolerance. */
const NUMERIC_TOLERANCE = 1e-9;

type ColumnInfo = { name: string; columnType: string };

const tables = { customerEntitlements, rollovers, usageWindows } as const;
const tableNames: Record<SubjectRowTable, string> = {
	customerEntitlements: "customer_entitlements",
	rollovers: "rollovers",
	usageWindows: "usage_windows",
};

export class UnknownSubjectRowColumnError extends Error {
	constructor({ table, column }: { table: string; column: string }) {
		super(`Unknown column for ${table}: ${column}`);
		this.name = "UnknownSubjectRowColumnError";
	}
}

/** The shared drizzle table is the allowlist: a change can only touch a column the schema declares. */
const columnOf = ({
	table,
	column,
}: {
	table: SubjectRowTable;
	column: string;
}): ColumnInfo => {
	const columns = getTableColumns(tables[table]) as Record<string, ColumnInfo>;
	const info = columns[column];
	if (!info) throw new UnknownSubjectRowColumnError({ table, column });
	return info;
};

const valueSql = ({
	info,
	value,
}: {
	info: ColumnInfo;
	value: unknown;
}): SQL =>
	// Bound as text first: the driver would JSON-encode a string aimed straight at jsonb.
	info.columnType === "PgJsonb"
		? sql`${value === null ? null : JSON.stringify(value)}::text::jsonb`
		: sql`${value}`;

const guardSql = ({
	info,
	value,
}: {
	info: ColumnInfo;
	value: unknown;
}): SQL => {
	const column = sql.identifier(info.name);
	if (info.columnType === "PgNumericNumber" && typeof value === "number") {
		return sql`abs(${column} - ${value}) < ${NUMERIC_TOLERANCE}`;
	}
	return sql`${column} IS NOT DISTINCT FROM ${valueSql({ info, value })}`;
};

/** UPDATE … SET after WHERE id = $id AND before…  RETURNING id; no row back means the guard failed. */
export const subjectRowUpdateSql = ({
	update,
}: {
	update: SubjectRowUpdate;
}): SQL => {
	const assignments = Object.entries(update.after).map(([column, value]) => {
		const info = columnOf({ table: update.table, column });
		return sql`${sql.identifier(info.name)} = ${valueSql({ info, value })}`;
	});
	if (assignments.length === 0) {
		throw new Error(`Subject row update for ${update.id} sets no columns`);
	}
	const guards = Object.entries(update.before).map(([column, value]) =>
		guardSql({ info: columnOf({ table: update.table, column }), value }),
	);
	const where = sql.join([sql`id = ${update.id}`, ...guards], sql` AND `);

	return sql`
		UPDATE ${sql.identifier(tableNames[update.table])}
		SET ${sql.join(assignments, sql`, `)}
		WHERE ${where}
		RETURNING id
	`;
};
