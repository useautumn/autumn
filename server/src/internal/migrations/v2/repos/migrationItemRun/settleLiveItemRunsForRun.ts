import { MigrationItemRunStatus, migrationItemRuns } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/** Flip a run's leftover `running` claims to `failed` when the run settles.
 * Without this, a dead run's claims hold the live-item mutex forever and
 * block every other migration on those items. */
export const settleLiveItemRunsForRun = async ({
	ctx,
	migrationRunId,
}: {
	ctx: RepoContext;
	migrationRunId: string;
}): Promise<number> => {
	const settled = await ctx.db
		.update(migrationItemRuns)
		.set({
			status: MigrationItemRunStatus.Failed,
			updated_at: Date.now(),
		})
		.where(
			and(
				eq(migrationItemRuns.migration_run_id, migrationRunId),
				eq(migrationItemRuns.dry_run, false),
				eq(migrationItemRuns.status, MigrationItemRunStatus.Running),
			),
		)
		.returning({ item_id: migrationItemRuns.item_id });
	return settled.length;
};
