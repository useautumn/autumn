import {
	type MigrationRun,
	type MigrationRunInsert,
	MigrationRunStatus,
	migrationRuns,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";
import { generateId } from "@/utils/genUtils.js";

export const insertMigrationRun = async ({
	ctx,
	insert,
}: {
	ctx: RepoContext;
	insert: Pick<MigrationRunInsert, "migration_internal_id" | "dry_run">;
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
			created_at: now,
			updated_at: null,
			started_at: null,
			finished_at: null,
		})
		.onConflictDoNothing({
			target: [migrationRuns.org_id, migrationRuns.env],
			where: sql`${migrationRuns.status} IN ('queued', 'running')`,
		})
		.returning();

	return row ?? null;
};
