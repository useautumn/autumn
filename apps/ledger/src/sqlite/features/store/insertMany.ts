import { features } from "../../common/schema/features.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

type FeatureRow = typeof features.$inferInsert;

// Features are per org, so a second customer in the same shard re-inserts them.
export const insertMany = ({
	ctx,
	rows,
}: {
	ctx: SqliteContext;
	rows: FeatureRow[];
}): void => {
	if (rows.length === 0) return;
	ctx.sqlite.insert(features).values(rows).onConflictDoNothing().run();
};
