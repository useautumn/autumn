import { sql } from "drizzle-orm";
import type { PostgresContext } from "../../types/postgresClient.js";

/** A lock as its caller names it; (org_id, env, lock_id) is the table's unique index. */
export type LockRowKey = { orgId: string; env: string; lockId: string };

/** The open lock rows under these keys, in one probe of the unique index; a key with no row is absent. */
export const readLockRows = async ({
	ctx,
	keys,
}: {
	ctx: Pick<PostgresContext, "db">;
	keys: readonly LockRowKey[];
}): Promise<unknown[]> => {
	if (keys.length === 0) return [];
	// row_to_json keeps numeric columns numbers, as the subject's rows are read.
	const { rows } = await ctx.db.execute(sql`
		SELECT row_to_json(bl) AS lock
		FROM balance_locks bl
		JOIN jsonb_to_recordset(${JSON.stringify(keys)}::text::jsonb)
			AS k("orgId" text, env text, "lockId" text)
			ON bl.org_id = k."orgId" AND bl.env = k.env AND bl.lock_id = k."lockId"`);
	return rows.map((row) => row.lock);
};
