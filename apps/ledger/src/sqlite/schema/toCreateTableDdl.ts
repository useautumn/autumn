import {
	getTableConfig,
	type SQLiteColumn,
	type SQLiteTable,
} from "drizzle-orm/sqlite-core";

const toColumnDdl = ({ column }: { column: SQLiteColumn }): string =>
	[
		`"${column.name}"`,
		column.getSQLType(),
		column.primary ? "primary key" : "",
		column.notNull ? "not null" : "",
	]
		.filter(Boolean)
		.join(" ");

export const toCreateTableDdl = ({ table }: { table: SQLiteTable }): string => {
	const { name, columns } = getTableConfig(table);
	const columnDdl = columns.map((column) => toColumnDdl({ column })).join(", ");

	return `create table "${name}" (${columnDdl})`;
};
