import {
	type MigrationRun,
	type MigrationRunInsert,
	migrationRuns,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export const updateMigrationRun = async ({
	ctx,
	internalId,
	updates,
}: {
	ctx: RepoContext;
	internalId: string;
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
			),
		)
		.returning();

	return row ?? null;
};
