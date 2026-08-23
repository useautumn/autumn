import { customers } from "../../common/schema/customers.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

type CustomerRow = typeof customers.$inferInsert;

export const insertMany = ({
	ctx,
	rows,
}: {
	ctx: SqliteContext;
	rows: CustomerRow[];
}): void => {
	if (rows.length === 0) return;
	ctx.sqlite.insert(customers).values(rows).onConflictDoNothing().run();
};
