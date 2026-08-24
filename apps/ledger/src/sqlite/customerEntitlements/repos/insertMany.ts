import { customerEntitlements } from "../../schema/customerEntitlements.js";
import type { SqliteContext } from "../../types/sqliteContext.js";

type CustomerEntitlementRow = typeof customerEntitlements.$inferInsert;

export const insertMany = ({
	ctx,
	rows,
}: {
	ctx: SqliteContext;
	rows: CustomerEntitlementRow[];
}): void => {
	if (rows.length === 0) return;
	ctx.sqlite.insert(customerEntitlements).values(rows).run();
};
