import { customerProducts } from "../../common/schema/customerProducts.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

type CustomerProductRow = typeof customerProducts.$inferInsert;

export const insertMany = ({
	ctx,
	rows,
}: {
	ctx: SqliteContext;
	rows: CustomerProductRow[];
}): void => {
	if (rows.length === 0) return;
	ctx.sqlite.insert(customerProducts).values(rows).onConflictDoNothing().run();
};
