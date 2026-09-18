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

export class SubjectRowColumnNotCounterError extends Error {
	constructor({
		table,
		column,
		expected,
	}: {
		table: string;
		column: string;
		expected: string;
	}) {
		super(
			`Column ${column} of ${table} is not ${expected}; it cannot be added to`,
		);
		this.name = "SubjectRowColumnNotCounterError";
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

const jsonSql = (value: unknown): SQL =>
	// Bound as text first: the driver would JSON-encode a string aimed straight at jsonb.
	sql`${value === null ? null : JSON.stringify(value)}::text::jsonb`;

const valueSql = ({
	info,
	value,
}: {
	info: ColumnInfo;
	value: unknown;
}): SQL => (info.columnType === "PgJsonb" ? jsonSql(value) : sql`${value}`);

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

/** `col = col + $delta` on a numeric column. */
const addSql = ({
	table,
	column,
	delta,
}: {
	table: SubjectRowTable;
	column: string;
	delta: number;
}): SQL => {
	const info = columnOf({ table, column });
	if (info.columnType !== "PgNumericNumber") {
		throw new SubjectRowColumnNotCounterError({
			table,
			column,
			expected: "numeric",
		});
	}
	const identifier = sql.identifier(info.name);
	return sql`${identifier} = ${identifier} + ${delta}`;
};

type MapEntryBehaviour = { seed: (key: string) => SQL; prunesAtZero: boolean };

/** How each counter map seeds a missing entry (counters at zero) and whether a zeroed entry leaves; mirrors the engine's rowIncrement.ts. */
const MAP_ENTRIES: Record<
	SubjectRowTable,
	Record<string, MapEntryBehaviour>
> = {
	customerEntitlements: {
		entities: {
			seed: (key) =>
				sql`jsonb_build_object('id', ${key}::text, 'balance', 0, 'adjustment', 0)`,
			prunesAtZero: false,
		},
		usage_attribution: {
			seed: () => sql`'{"units":0,"credits":0}'::jsonb`,
			prunesAtZero: true,
		},
	},
	rollovers: {
		entities: {
			seed: (key) =>
				sql`jsonb_build_object('id', ${key}::text, 'balance', 0, 'usage', 0)`,
			prunesAtZero: false,
		},
	},
	usageWindows: {},
};

/** The stored entry with its counters added; a field the entry lacks counts from zero. */
const entryAfterAddSql = ({
	column,
	key,
	fields,
	seed,
}: {
	column: string;
	key: string;
	fields: Record<string, number>;
	seed: (key: string) => SQL;
}): SQL => {
	const stored = sql`${sql.identifier(column)} -> ${key}`;
	const moved = Object.entries(fields).map(
		([field, delta]) =>
			sql`${field}::text, to_jsonb(coalesce((${stored} ->> ${field})::numeric, 0) + ${delta})`,
	);
	return sql`coalesce(${stored}, ${seed(key)}) || jsonb_build_object(${sql.join(moved, sql`, `)})`;
};

/** One jsonb map column with each named entry rebuilt in place; a pruning column drops an entry whose counters all reached zero. */
const mapAddSql = ({
	table,
	column,
	entries,
}: {
	table: SubjectRowTable;
	column: string;
	entries: Record<string, Record<string, number>>;
}): SQL => {
	const info = columnOf({ table, column });
	const behaviour = MAP_ENTRIES[table][column];
	if (info.columnType !== "PgJsonb" || !behaviour) {
		throw new SubjectRowColumnNotCounterError({
			table,
			column,
			expected: "a counter map",
		});
	}
	const identifier = sql.identifier(info.name);
	let value: SQL = sql`coalesce(${identifier}, '{}'::jsonb)`;
	for (const [key, fields] of Object.entries(entries)) {
		const entry = entryAfterAddSql({
			column: info.name,
			key,
			fields,
			seed: behaviour.seed,
		});
		const written = sql`jsonb_set(${value}, ARRAY[${key}]::text[], ${entry})`;
		if (!behaviour.prunesAtZero) {
			value = written;
			continue;
		}
		const zeroed = sql.join(
			Object.keys(fields).map(
				(field) => sql`((${entry}) ->> ${field})::numeric = 0`,
			),
			sql` AND `,
		);
		value = sql`CASE WHEN ${zeroed} THEN ${value} - ${key}::text ELSE ${written} END`;
	}
	return sql`${identifier} = ${value}`;
};

const assignmentsOf = ({ update }: { update: SubjectRowUpdate }): SQL[] => {
	const { table } = update;
	if (update.kind === "set") {
		return Object.entries(update.set).map(([column, value]) => {
			const info = columnOf({ table, column });
			return sql`${sql.identifier(info.name)} = ${valueSql({ info, value })}`;
		});
	}
	return [
		...Object.entries(update.add).map(([column, delta]) =>
			addSql({ table, column, delta }),
		),
		...Object.entries(update.addEntries).map(([column, entries]) =>
			mapAddSql({ table, column, entries }),
		),
	];
};

/** UPDATE … SET <replaced columns, or counters added> WHERE id = $id AND <guards> RETURNING id; no row back means the guard failed or the row is gone. */
export const subjectRowUpdateSql = ({
	update,
}: {
	update: SubjectRowUpdate;
}): SQL => {
	const assignments = assignmentsOf({ update });
	if (assignments.length === 0) {
		throw new Error(`Subject row update for ${update.id} sets no columns`);
	}
	const guards = Object.entries(update.guard).map(([column, value]) =>
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
