import { MigrationItemKind } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/**
 * Which of the given migrations have run at least once for real. The LATERAL
 * `LIMIT 1` is load-bearing: it blocks the semi-join pull-up that makes the
 * planner scan every item run row, so each id costs one index seek instead.
 */
export const listMigrationIdsWithLiveRuns = async ({
	ctx,
	migrationInternalIds,
	itemKind = MigrationItemKind.Customer,
}: {
	ctx: RepoContext;
	migrationInternalIds: string[];
	itemKind?: MigrationItemKind;
}): Promise<Set<string>> => {
	if (migrationInternalIds.length === 0) return new Set();

	const rows = (await ctx.db.execute(sql`
		SELECT candidate.migration_internal_id
		FROM unnest(${sql.param(migrationInternalIds)}::text[])
			AS candidate(migration_internal_id)
		CROSS JOIN LATERAL (
			SELECT 1
			FROM migration_item_runs item_run
			WHERE item_run.migration_internal_id = candidate.migration_internal_id
				AND item_run.item_kind = ${itemKind}
				AND item_run.dry_run = false
			LIMIT 1
		) AS live_run(found)
	`)) as Array<{ migration_internal_id: string }>;

	return new Set(rows.map((row) => row.migration_internal_id));
};
