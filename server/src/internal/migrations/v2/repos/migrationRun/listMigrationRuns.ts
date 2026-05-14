import {
	ACTIVE_MIGRATION_RUN_STATUSES,
	type MigrationRun,
	migrationRuns,
} from "@autumn/shared";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export const listMigrationRuns = async ({
	ctx,
	internalId,
	migrationInternalId,
	triggerRunId,
	active,
}: {
	ctx: RepoContext;
	internalId?: string;
	migrationInternalId?: string;
	triggerRunId?: string;
	active?: boolean;
}): Promise<MigrationRun[]> => {
	const where: SQL[] = [
		eq(migrationRuns.org_id, ctx.org.id),
		eq(migrationRuns.env, ctx.env),
	];

	if (internalId !== undefined)
		where.push(eq(migrationRuns.internal_id, internalId));
	if (migrationInternalId !== undefined)
		where.push(eq(migrationRuns.migration_internal_id, migrationInternalId));
	if (triggerRunId !== undefined)
		where.push(eq(migrationRuns.trigger_run_id, triggerRunId));
	if (active === true)
		where.push(inArray(migrationRuns.status, ACTIVE_MIGRATION_RUN_STATUSES));

	return ctx.db
		.select()
		.from(migrationRuns)
		.where(and(...where))
		.orderBy(desc(migrationRuns.created_at));
};
