import { migrationRuns } from "@autumn/shared";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/** Migrations where a live, unscoped run reached execution (`started_at`
 * is only written when execution starts, not at dispatch). */
export const listMigrationIdsWithStartedRunAll = async ({
	ctx,
	migrationInternalIds,
}: {
	ctx: RepoContext;
	migrationInternalIds: string[];
}): Promise<Set<string>> => {
	if (migrationInternalIds.length === 0) return new Set();

	const rows = await ctx.db
		.selectDistinct({
			migration_internal_id: migrationRuns.migration_internal_id,
		})
		.from(migrationRuns)
		.where(
			and(
				eq(migrationRuns.org_id, ctx.org.id),
				eq(migrationRuns.env, ctx.env),
				eq(migrationRuns.dry_run, false),
				isNull(migrationRuns.only_ids),
				isNull(migrationRuns.target_limit),
				isNotNull(migrationRuns.started_at),
				inArray(migrationRuns.migration_internal_id, migrationInternalIds),
			),
		);

	return new Set(rows.map((row) => row.migration_internal_id));
};
