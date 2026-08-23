import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
	integer,
	real,
	type SQLiteColumnBuilderBase,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

// Drizzle's builder classes are invariant, so constraints are applied structurally.
type ConstrainableBuilder = SQLiteColumnBuilderBase & {
	notNull: () => ConstrainableBuilder;
	primaryKey: () => SQLiteColumnBuilderBase;
};

const toColumnBuilder = ({
	column,
}: {
	column: PgColumn;
}): ConstrainableBuilder => {
	switch (column.columnType) {
		case "PgBoolean":
			return integer(column.name, { mode: "boolean" });
		case "PgInteger":
		case "PgSerial":
		case "PgSmallInt":
		case "PgSmallSerial":
		case "PgBigInt53":
		case "PgBigSerial53":
			return integer(column.name);
		case "PgTimestamp":
		case "PgTimestampString":
		case "PgDate":
		case "PgDateString":
			return integer(column.name, { mode: "timestamp_ms" });
		case "PgNumeric":
		case "PgNumericNumber":
		case "PgReal":
		case "PgDoublePrecision":
			return real(column.name);
		// Sqlite has no array type; JSON keeps postgres arrays round-trippable.
		case "PgJson":
		case "PgJsonb":
		case "PgArray":
			return text(column.name, { mode: "json" });
		// text, varchar, uuid, char, enum — everything else renders as text.
		default:
			return text(column.name);
	}
};

const withConstraints = ({
	builder,
	column,
}: {
	builder: ConstrainableBuilder;
	column: PgColumn;
}): SQLiteColumnBuilderBase => {
	const notNullable = column.notNull ? builder.notNull() : builder;
	return column.primary ? notNullable.primaryKey() : notNullable;
};

export const toSqliteTable = (pgTable: PgTable) => {
	const columns: Record<string, SQLiteColumnBuilderBase> = {};
	for (const [key, column] of Object.entries(getTableColumns(pgTable))) {
		columns[key] = withConstraints({
			builder: toColumnBuilder({ column }),
			column,
		});
	}

	return sqliteTable(getTableName(pgTable), columns);
};
