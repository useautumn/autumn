import {
	type MigrationRun,
	type MigrationRunInsert,
	type MigrationRunStatus,
	migrationRuns,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export const updateMigrationRun = async ({
	ctx,
	internalId,
	updates,
	onlyIfStatusIn,
}: {
	ctx: RepoContext;
	internalId: string;
	onlyIfStatusIn?: readonly MigrationRunStatus[];
	updates: Partial<
		Pick<
			MigrationRunInsert,
			| "status"
			| "trigger_run_id"
			| "error_message"
			| "started_at"
			| "finished_at"
		>
	>;
}): Promise<MigrationRun | null> => {
	const [row] = await ctx.db
		.update(migrationRuns)
		.set({ ...updates, updated_at: Date.now() })
		.where(
			and(
				eq(migrationRuns.internal_id, internalId),
				eq(migrationRuns.org_id, ctx.org.id),
				eq(migrationRuns.env, ctx.env),
				...(onlyIfStatusIn
					? [inArray(migrationRuns.status, [...onlyIfStatusIn])]
					: []),
			),
		)
		.returning();

	return row ?? null;
};
