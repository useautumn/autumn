import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * Check if an error is a Postgres unique constraint violation (error code 23505).
 */
export const isUniqueConstraintError = (error: unknown): boolean => {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
};

export const buildConflictUpdateColumns = <T extends PgTable>(
	table: T,
	excludeColumns: (keyof T["_"]["columns"])[] = [],
) => {
	const cls = getTableColumns(table);
	const updateSet: Record<string, SQL> = {};

	for (const [columnKey, columnConfig] of Object.entries(cls)) {
		if (!excludeColumns.includes(columnKey as keyof T["_"]["columns"])) {
			updateSet[columnKey] = sql.raw(`excluded.${columnConfig.name}`);
		}
	}

	return updateSet;
};
