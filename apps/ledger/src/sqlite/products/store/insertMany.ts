import { products } from "../../common/schema/products.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

type ProductRow = typeof products.$inferInsert;

export const insertMany = ({
	ctx,
	rows,
}: {
	ctx: SqliteContext;
	rows: ProductRow[];
}): void => {
	if (rows.length === 0) return;
	ctx.sqlite.insert(products).values(rows).onConflictDoNothing().run();
};
