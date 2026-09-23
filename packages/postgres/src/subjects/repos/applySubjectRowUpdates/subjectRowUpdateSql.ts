import {
	balanceLocks,
	customerEntitlements,
	customerPrices,
	customerProducts,
	customers,
	entities,
	pooledBalances,
	rollovers,
	usageWindows,
} from "@autumn/shared";
import { getTableColumns, type SQL, sql } from "drizzle-orm";
import {
	type SubjectRowChange,
	subjectRowKeyColumnOf,
} from "../../types/subjectRowChange.js";
import type {
	SubjectRowTable,
	SubjectRowUpdate,
} from "../../types/subjectRowUpdate.js";

/** Balances are numeric read as JS numbers; the engine rounds at 1e-10, so equality is a tolerance. */
const NUMERIC_TOLERANCE = 1e-9;

type ColumnInfo = {
	name: string;
	columnType: string;
	getSQLType(): string;
	baseColumn?: { columnType: string };
};

const tables = {
	customers,
	entities,
	customerProducts,
	customerPrices,
	customerEntitlements,
	rollovers,
	usageWindows,
	pooledBalances,
	locks: balanceLocks,
} as const;

const tableNames: Record<SubjectRowTable, string> = {
	customers: "customers",
	entities: "entities",
	customerProducts: "customer_products",
	customerPrices: "customer_prices",
	customerEntitlements: "customer_entitlements",
	rollovers: "rollovers",
	usageWindows: "usage_windows",
	pooledBalances: "pooled_balances",
	locks: "balance_locks",
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

/** `ARRAY[...]::<type>[]`, each element bound as its base column would be; the driver cannot infer an array's element type. */
const arraySql = ({
	info,
	value,
}: {
	info: ColumnInfo;
	value: unknown;
}): SQL => {
	if (!Array.isArray(value)) return sql`NULL`;
	const elementsAreJson = info.baseColumn?.columnType === "PgJsonb";
	const elements = value.map((element) =>
		elementsAreJson ? jsonSql(element) : sql`${element}`,
	);
	return sql`ARRAY[${sql.join(elements, sql`, `)}]::${sql.raw(info.getSQLType())}`;
};

const valueSql = ({
	info,
	value,
}: {
	info: ColumnInfo;
	value: unknown;
}): SQL => {
	if (info.columnType === "PgJsonb") return jsonSql(value);
	if (info.columnType === "PgArray") return arraySql({ info, value });
	return sql`${value}`;
};

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
	customers: {},
	entities: {},
	customerProducts: {},
	customerPrices: {},
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
	pooledBalances: {},
	locks: {},
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

/** A column both set and added to in one flush lands as `col = $set + $delta`; the fold keeps map columns to one of the two. */
const assignmentsOf = ({ update }: { update: SubjectRowUpdate }): SQL[] => {
	const { table } = update;
	const assignments: SQL[] = [];
	for (const [column, value] of Object.entries(update.set)) {
		const info = columnOf({ table, column });
		const delta = update.add[column];
		assignments.push(
			delta === undefined
				? sql`${sql.identifier(info.name)} = ${valueSql({ info, value })}`
				: sql`${sql.identifier(info.name)} = ${value} + ${delta}`,
		);
	}
	for (const [column, delta] of Object.entries(update.add)) {
		if (column in update.set) continue;
		assignments.push(addSql({ table, column, delta }));
	}
	for (const [column, entries] of Object.entries(update.addEntries)) {
		if (column in update.set) {
			throw new SubjectRowColumnNotCounterError({
				table,
				column,
				expected: "added to or replaced, not both",
			});
		}
		assignments.push(mapAddSql({ table, column, entries }));
	}
	return assignments;
};

const keyColumnSql = ({ table }: { table: SubjectRowTable }): SQL =>
	sql`${sql.identifier(subjectRowKeyColumnOf({ table }))}`;

/** UPDATE … SET <replaced columns, counters added> WHERE <key> = $id AND <guards> RETURNING <key>; no row back means the guard failed or the row is gone. */
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
	const key = keyColumnSql({ table: update.table });
	const where = sql.join([sql`${key} = ${update.id}`, ...guards], sql` AND `);
	return sql`
		UPDATE ${sql.identifier(tableNames[update.table])}
		SET ${sql.join(assignments, sql`, `)}
		WHERE ${where}
		RETURNING ${key}
	`;
};

/** INSERT … RETURNING <key>; the shared table is the column allowlist, jsonb values travel as text. */
export const subjectRowInsertSql = ({
	table,
	row,
}: {
	table: SubjectRowTable;
	row: Record<string, unknown>;
}): SQL => {
	const entries = Object.entries(row);
	if (entries.length === 0)
		throw new Error(`Insert into ${table} has no columns`);
	const columns = entries.map(([column]) =>
		sql.identifier(columnOf({ table, column }).name),
	);
	const values = entries.map(([column, value]) =>
		valueSql({ info: columnOf({ table, column }), value }),
	);
	return sql`
		INSERT INTO ${sql.identifier(tableNames[table])} (${sql.join(columns, sql`, `)})
		VALUES (${sql.join(values, sql`, `)})
		RETURNING ${keyColumnSql({ table })}
	`;
};

export const subjectRowDeleteSql = ({
	table,
	id,
}: {
	table: SubjectRowTable;
	id: string;
}): SQL => {
	const key = keyColumnSql({ table });
	return sql`
		DELETE FROM ${sql.identifier(tableNames[table])}
		WHERE ${key} = ${id}
		RETURNING ${key}
	`;
};

/** The CTE body for one folded change. */
export const subjectRowChangeSql = ({
	change,
}: {
	change: SubjectRowChange;
}): SQL => {
	switch (change.op) {
		case "insert":
			return subjectRowInsertSql({ table: change.table, row: change.row });
		case "delete":
			return subjectRowDeleteSql({ table: change.table, id: change.id });
		case "update":
			return subjectRowUpdateSql({ update: change });
	}
};
