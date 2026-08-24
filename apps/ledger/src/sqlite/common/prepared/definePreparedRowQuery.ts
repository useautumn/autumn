import { is, SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { SqliteDb } from "../createSqliteDb.js";
import type { SqliteContext } from "../types/sqliteContext.js";

type TupleStatement = {
	values: (placeholderValues: Record<string, unknown>) => unknown[][];
};

// The projection must name every scalar field of the row, so the tuple sqlite
// returns and the keys written here always come from the same object. A nested
// field is named by its dotted path ("entitlement.allowance"). A `sql<T>` field
// is read exactly as sqlite returns it, so only project one for a value that
// needs no decoding.
type RowProjection<TRow> = {
	[Key in keyof TRow as TRow[Key] extends object ? never : Key]-?:
		| SQLiteColumn
		| SQL<TRow[Key]>;
} & Record<string, SQLiteColumn | SQL<unknown>>;

type ProjectedField = {
	// Objects to walk before the leaf; null for a plain top-level column.
	parents: string[] | null;
	leaf: string;
	column: SQLiteColumn | null;
};

const toProjectedField = ([key, field]: [
	string,
	SQLiteColumn | SQL<unknown>,
]): ProjectedField => {
	const path = key.split(".");
	return {
		parents: path.length > 1 ? path.slice(0, -1) : null,
		leaf: path[path.length - 1],
		column: is(field, SQL) ? null : field,
	};
};

// Drizzle's own row mapper re-derives a decoder and walks a key path for every
// column of every row; a fixed projection decodes straight into the row.
export const definePreparedRowQuery = <TRow>({
	projection,
	build,
}: {
	projection: RowProjection<TRow>;
	build: (params: {
		db: SqliteDb;
		projection: RowProjection<TRow>;
	}) => TupleStatement;
}): ((params: {
	ctx: SqliteContext;
	placeholderValues: Record<string, unknown>;
}) => TRow[]) => {
	const fields = (
		Object.entries(projection) as [string, SQLiteColumn | SQL<unknown>][]
	).map(toProjectedField);
	const statements = new WeakMap<SqliteDb, TupleStatement>();

	const getStatement = ({ ctx }: { ctx: SqliteContext }): TupleStatement => {
		const prepared = statements.get(ctx.sqlite);
		if (prepared) return prepared;

		const statement = build({ db: ctx.sqlite, projection });
		statements.set(ctx.sqlite, statement);
		return statement;
	};

	return ({ ctx, placeholderValues }) => {
		const rows: TRow[] = [];

		for (const tuple of getStatement({ ctx }).values(placeholderValues)) {
			const row: Record<string, unknown> = {};
			for (let index = 0; index < fields.length; index++) {
				const { parents, leaf, column } = fields[index];
				const value = tuple[index];
				const decoded =
					value === null || column === null
						? value
						: column.mapFromDriverValue(value);

				if (parents === null) {
					row[leaf] = decoded;
					continue;
				}
				let target = row;
				for (const parent of parents) {
					const nested = target[parent] ?? {};
					target[parent] = nested;
					target = nested as Record<string, unknown>;
				}
				target[leaf] = decoded;
			}
			// Text columns hold postgres enums verbatim; the row type names them.
			rows.push(row as TRow);
		}

		return rows;
	};
};
