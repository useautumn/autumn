import {
	type BuildColumns,
	type ColumnBuilderBase,
	getTableColumns,
	getTableName,
	type HasDefault,
	type IsPrimaryKey,
	is,
	type NotNull,
	SQL,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import {
	integer,
	real,
	type SQLiteBooleanBuilder,
	type SQLiteColumnBuilderBase,
	type SQLiteIntegerBuilder,
	type SQLiteRealBuilder,
	type SQLiteTableWithColumns,
	type SQLiteTextBuilder,
	type SQLiteTextJsonBuilder,
	type SQLiteTimestampBuilder,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

type PgColumnConfig = PgColumn["_"];

const INTEGER_COLUMN_TYPES = [
	"PgInteger",
	"PgSerial",
	"PgSmallInt",
	"PgSmallSerial",
	"PgBigInt53",
	"PgBigSerial53",
] as const;
const TIMESTAMP_COLUMN_TYPES = [
	"PgTimestamp",
	"PgTimestampString",
	"PgDate",
	"PgDateString",
] as const;
const REAL_COLUMN_TYPES = [
	"PgNumeric",
	"PgNumericNumber",
	"PgReal",
	"PgDoublePrecision",
] as const;
// Sqlite has no array type; JSON keeps postgres arrays round-trippable.
const JSON_COLUMN_TYPES = ["PgJson", "PgJsonb", "PgArray"] as const;

type IntegerColumnType = (typeof INTEGER_COLUMN_TYPES)[number];
type TimestampColumnType = (typeof TIMESTAMP_COLUMN_TYPES)[number];
type RealColumnType = (typeof REAL_COLUMN_TYPES)[number];
type JsonColumnType = (typeof JSON_COLUMN_TYPES)[number];

// Text and json carry the postgres `data` type ($type<>, enum literals, jsonb
// shapes); the rest read back as the sqlite driver's own type.
type DerivedBuilder<TConfig extends PgColumnConfig> =
	TConfig["columnType"] extends "PgBoolean"
		? SQLiteBooleanBuilder<{
				name: TConfig["name"];
				dataType: "boolean";
				columnType: "SQLiteBoolean";
				data: boolean;
				driverParam: number;
				enumValues: undefined;
			}>
		: TConfig["columnType"] extends IntegerColumnType
			? SQLiteIntegerBuilder<{
					name: TConfig["name"];
					dataType: "number";
					columnType: "SQLiteInteger";
					data: number;
					driverParam: number;
					enumValues: undefined;
				}>
			: TConfig["columnType"] extends TimestampColumnType
				? SQLiteTimestampBuilder<{
						name: TConfig["name"];
						dataType: "date";
						columnType: "SQLiteTimestamp";
						data: Date;
						driverParam: number;
						enumValues: undefined;
					}>
				: TConfig["columnType"] extends RealColumnType
					? SQLiteRealBuilder<{
							name: TConfig["name"];
							dataType: "number";
							columnType: "SQLiteReal";
							data: number;
							driverParam: number;
							enumValues: undefined;
						}>
					: TConfig["columnType"] extends JsonColumnType
						? SQLiteTextJsonBuilder<{
								name: TConfig["name"];
								dataType: "json";
								columnType: "SQLiteTextJson";
								data: TConfig["data"];
								driverParam: string;
								enumValues: undefined;
								generated: undefined;
							}>
						: SQLiteTextBuilder<{
								name: TConfig["name"];
								dataType: "string";
								columnType: "SQLiteText";
								data: TConfig["data"];
								driverParam: string;
								enumValues: TConfig["enumValues"];
								length: undefined;
							}>;

type WithNotNull<
	TBuilder extends ColumnBuilderBase,
	TConfig extends PgColumnConfig,
> = TConfig["notNull"] extends true ? NotNull<TBuilder> : TBuilder;

type WithDefault<
	TBuilder extends ColumnBuilderBase,
	TConfig extends PgColumnConfig,
> = TConfig["hasDefault"] extends true ? HasDefault<TBuilder> : TBuilder;

type WithPrimaryKey<
	TBuilder extends ColumnBuilderBase,
	TConfig extends PgColumnConfig,
> = TConfig["isPrimaryKey"] extends true ? IsPrimaryKey<TBuilder> : TBuilder;

type DerivedColumn<TColumn extends PgColumn> = WithPrimaryKey<
	WithNotNull<
		WithDefault<DerivedBuilder<TColumn["_"]>, TColumn["_"]>,
		TColumn["_"]
	>,
	TColumn["_"]
>;

type DerivedColumns<TPgTable extends PgTable> = {
	[Key in keyof TPgTable["_"]["columns"]]: DerivedColumn<
		TPgTable["_"]["columns"][Key]
	>;
};

export type DerivedSqliteTable<TPgTable extends PgTable> =
	SQLiteTableWithColumns<{
		name: TPgTable["_"]["name"];
		schema: undefined;
		columns: BuildColumns<
			TPgTable["_"]["name"],
			DerivedColumns<TPgTable>,
			"sqlite"
		>;
		dialect: "sqlite";
	}>;

// Drizzle's builder classes are invariant, so constraints are applied structurally.
type ConstrainableBuilder = SQLiteColumnBuilderBase & {
	notNull(): ConstrainableBuilder;
	primaryKey(): SQLiteColumnBuilderBase;
	default(value: unknown): ConstrainableBuilder;
};

const rendersAs = ({
	column,
	columnTypes,
}: {
	column: PgColumn;
	columnTypes: readonly string[];
}): boolean => columnTypes.includes(column.columnType);

const toColumnBuilder = ({
	column,
}: {
	column: PgColumn;
}): ConstrainableBuilder => {
	if (column.columnType === "PgBoolean") {
		return integer(column.name, { mode: "boolean" });
	}
	if (rendersAs({ column, columnTypes: INTEGER_COLUMN_TYPES })) {
		return integer(column.name);
	}
	if (rendersAs({ column, columnTypes: TIMESTAMP_COLUMN_TYPES })) {
		return integer(column.name, { mode: "timestamp_ms" });
	}
	if (rendersAs({ column, columnTypes: REAL_COLUMN_TYPES })) {
		return real(column.name);
	}
	if (rendersAs({ column, columnTypes: JSON_COLUMN_TYPES })) {
		return text(column.name, { mode: "json" });
	}

	// text, varchar, uuid, char, enum — everything else renders as text.
	return text(column.name);
};

// A postgres expression default cannot be replayed here, so only literals carry
// over; `hasDefault` still mirrors postgres so insert types match its rows.
const withPgDefault = ({
	builder,
	column,
}: {
	builder: ConstrainableBuilder;
	column: PgColumn;
}): ConstrainableBuilder => {
	const hasLiteralDefault =
		column.hasDefault &&
		column.default !== undefined &&
		!is(column.default, SQL);
	return hasLiteralDefault ? builder.default(column.default) : builder;
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

export const toSqliteTable = <TPgTable extends PgTable>(
	pgTable: TPgTable,
): DerivedSqliteTable<TPgTable> => {
	const columns: Record<string, SQLiteColumnBuilderBase> = {};
	for (const [key, column] of Object.entries(getTableColumns(pgTable))) {
		columns[key] = withConstraints({
			builder: withPgDefault({
				builder: toColumnBuilder({ column }),
				column,
			}),
			column,
		});
	}

	// The runtime builds an untyped column map; the derived type is what the
	// mapping above proves column by column.
	return sqliteTable(
		getTableName(pgTable),
		columns,
	) as unknown as DerivedSqliteTable<TPgTable>;
};
