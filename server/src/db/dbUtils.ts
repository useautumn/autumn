import { getTableColumns, sql, SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

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
