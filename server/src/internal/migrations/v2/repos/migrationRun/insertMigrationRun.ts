import {
	type MigrationRun,
	type MigrationRunInsert,
	MigrationRunStatus,
	migrationRuns,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";
import { generateId } from "@/utils/genUtils.js";

/** Insert a new `migration_runs` row in `queued` status. The partial unique
 *  index on `(org_id, env) WHERE status IN ('queued','running')` blocks
 *  concurrent claims for the same org/env. Returns `null` on conflict. */
export const insertMigrationRun = async ({
	ctx,
	insert,
}: {
	ctx: RepoContext;
	insert: Pick<
		MigrationRunInsert,
		"migration_internal_id" | "dry_run" | "lazy_run"
	>;
}): Promise<MigrationRun | null> => {
	const now = Date.now();

	const [row] = await ctx.db
		.insert(migrationRuns)
		.values({
			internal_id: generateId("mrun"),
			migration_internal_id: insert.migration_internal_id,
			org_id: ctx.org.id,
			env: ctx.env,
			status: MigrationRunStatus.Queued,
			dry_run: insert.dry_run,
			lazy_run: insert.lazy_run ?? false,
			created_at: now,
			updated_at: null,
			started_at: null,
			finished_at: null,
		})
		.onConflictDoNothing({
			target: [migrationRuns.migration_internal_id],
			where: sql`${migrationRuns.status} IN ('queued', 'running')`,
		})
		.returning();

	return row ?? null;
};
