import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** One keyset page of the migration's item runs still holding unpublished
 * changes, in item_id order. */
export const listUnpublishedItemRunIds = async ({
	db,
	migrationInternalId,
	afterInternalId,
	limit,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	afterInternalId?: string;
	limit: number;
}): Promise<string[]> => {
	const rows = await db.execute<{ item_id: string }>(sql`
		SELECT item_id
		FROM migration_item_runs
		WHERE migration_internal_id = ${migrationInternalId}
			AND unpublished_changes IS NOT NULL
			AND dry_run = false
			AND item_kind = 'customer'
			${afterInternalId ? sql`AND item_id > ${afterInternalId}` : sql``}
		ORDER BY item_id
		LIMIT ${limit}
	`);
	return rows.map((row) => row.item_id);
};
