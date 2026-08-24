import { getTableColumns } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

const NUMBER_COLUMN_TYPES = [
	"PgInteger",
	"PgSerial",
	"PgSmallInt",
	"PgSmallSerial",
	"PgBigInt53",
	"PgBigSerial53",
	"PgNumeric",
	"PgNumericNumber",
	"PgReal",
	"PgDoublePrecision",
] as const;
const DATE_COLUMN_TYPES = [
	"PgTimestamp",
	"PgTimestampString",
	"PgDate",
	"PgDateString",
] as const;
const JSON_COLUMN_TYPES = ["PgJson", "PgJsonb"] as const;

const rendersAs = ({
	column,
	columnTypes,
}: {
	column: PgColumn;
	columnTypes: readonly string[];
}): boolean => columnTypes.includes(column.columnType);

const toColumnSchema = ({ column }: { column: PgColumn }): z.ZodType => {
	if (column.columnType === "PgBoolean") return z.boolean();
	if (rendersAs({ column, columnTypes: NUMBER_COLUMN_TYPES }))
		return z.number();
	// A date crosses the journal as whatever JSON.stringify left behind.
	if (rendersAs({ column, columnTypes: DATE_COLUMN_TYPES }))
		return z.union([z.string(), z.number(), z.date()]);
	if (rendersAs({ column, columnTypes: JSON_COLUMN_TYPES })) return z.unknown();
	if (column.columnType === "PgArray") return z.array(z.unknown());

	return z.string();
};

type RowShape<TRow> = { [Key in keyof TRow]-?: z.ZodType<TRow[Key]> };

/** The journal's row values are the Postgres row shapes, derived from the same
 *  drizzle tables the server writes — no defaults, so a partial stays partial. */
export const pgTableToRowSchema = <TTable extends PgTable>(
	table: TTable,
): z.ZodObject<RowShape<TTable["$inferSelect"]>> => {
	const shape: Record<string, z.ZodType> = {};
	for (const [key, column] of Object.entries(getTableColumns(table))) {
		const schema = toColumnSchema({ column });
		shape[key] = column.notNull ? schema : schema.nullish();
	}

	// The runtime maps drizzle's column types; the return type is what that
	// column-by-column mapping proves, the `toSqliteTable` shape.
	return z.object(shape) as unknown as z.ZodObject<
		RowShape<TTable["$inferSelect"]>
	>;
};
