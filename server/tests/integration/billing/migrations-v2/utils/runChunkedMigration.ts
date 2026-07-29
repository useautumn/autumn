import {
	type Migration,
	migrationItemRuns,
	migrations,
} from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationChunkRunResult } from "@/internal/migrations/v2/run/chunks/iterateMigrationChunks.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";
import { waitForMigrationResult } from "./runUpdatePlanMigration";

/** Reruns reuse readable migration ids; the delete guard blocks ids with run
 * history, so tests clear their own previous history first. */
const clearMigrationRunHistory = async ({
	ctx,
	migrationId,
}: {
	ctx: AutumnContext;
	migrationId: string;
}) => {
	const [existing] = await ctx.db
		.select({ internal_id: migrations.internal_id })
		.from(migrations)
		.where(
			and(
				eq(migrations.id, migrationId),
				eq(migrations.org_id, ctx.org.id),
				eq(migrations.env, ctx.env),
			),
		)
		.limit(1);
	if (!existing) return;

	await ctx.db
		.delete(migrationItemRuns)
		.where(eq(migrationItemRuns.migration_internal_id, existing.internal_id));
};

type MigrationClient = {
	migrationsV2: {
		deleteAndCreate: (params: {
			id: string;
			filter?: MigrationFilter | null;
			operations?: Operations | null;
			no_billing_changes?: boolean;
		}) => Promise<Migration>;
		run: (params: { id: string; dry_run?: boolean }) => Promise<{
			migration_id: string;
			dry_run: boolean;
			run_id: string;
		}>;
	};
};

/** Creates + runs a migration through the real chunked runner. Direct mode
 * (default) awaits runMigrationInChunks in-process; runOnServer goes via API. */
export const runChunkedMigration = async ({
	ctx,
	migrationClient,
	migrationId,
	filter,
	operations,
	noBillingChanges,
	runOnServer = false,
	waitFor,
	timeoutMs = 60_000,
	pollIntervalMs = 1_000,
}: {
	ctx: AutumnContext;
	migrationClient: MigrationClient;
	migrationId: string;
	filter: MigrationFilter;
	operations: Operations;
	noBillingChanges?: boolean;
	runOnServer?: boolean;
	waitFor?: () => Promise<unknown>;
	timeoutMs?: number;
	pollIntervalMs?: number;
}): Promise<{
	migration: Migration;
	migrationRunId: string;
	/** Direct mode only — carries the executed lane for assertions. */
	result?: MigrationChunkRunResult;
}> => {
	await clearMigrationRunHistory({ ctx, migrationId });
	const migration = await migrationClient.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter,
		operations,
		no_billing_changes: noBillingChanges,
	});

	if (runOnServer) {
		const runResponse = await migrationClient.migrationsV2.run({
			id: migration.id,
			dry_run: false,
		});
		if (waitFor) {
			await waitForMigrationResult({ waitFor, timeoutMs, pollIntervalMs });
		}
		return { migration, migrationRunId: runResponse.run_id };
	}

	const migrationRunId = generateId("mrun");
	const result = await runMigrationInChunks({
		ctx,
		migration,
		migrationRunId,
		dryRun: false,
	});
	return { migration, migrationRunId, result };
};
