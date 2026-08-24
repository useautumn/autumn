import { entitlements } from "../../common/schema/entitlements.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

type EntitlementRow = typeof entitlements.$inferInsert;

export const insertMany = ({
	ctx,
	rows,
}: {
	ctx: SqliteContext;
	rows: EntitlementRow[];
}): void => {
	if (rows.length === 0) return;
	ctx.sqlite.insert(entitlements).values(rows).onConflictDoNothing().run();
};
