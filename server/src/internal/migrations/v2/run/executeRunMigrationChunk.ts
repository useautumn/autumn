import { isMigrationCancelRequested } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runScopeItems } from "./orchestrators/runScopeItems.js";
import type { MigrationChunkResult } from "./types/migrationChunkResult.js";
import type { RunMigrationChunkPayload } from "./types/migrationRunPayloads.js";
import { MIGRATION_RUN_CUSTOMER_CONCURRENCY } from "./utils/migrationRunConstants.js";

/** One chunk's workload (the child side of the process boundary): cancel
 * check, snapshot identity check, then exactly the payload's customers. */
export const executeRunMigrationChunk = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: RunMigrationChunkPayload;
}): Promise<MigrationChunkResult> => {
	if (
		await isMigrationCancelRequested({ migrationRunId: payload.migrationRunId })
	) {
		return { processed: 0 };
	}

	if (
		payload.migration.id !== payload.migrationId ||
		payload.migration.org_id !== payload.orgId ||
		payload.migration.env !== payload.env
	) {
		throw new Error("Migration chunk snapshot identity does not match payload");
	}

	ctx.logger.info("run-migration-chunk: starting", {
		data: {
			migrationRunId: payload.migrationRunId,
			pageIndex: payload.pageIndex,
			attempt: payload.attempt,
			customers: payload.customers.length,
		},
	});

	const summary = await runScopeItems({
		ctx,
		migration: payload.migration,
		migrationRunId: payload.migrationRunId,
		dryRun: payload.dryRun,
		kind: "customer",
		iterate: async function* () {
			yield payload.customers.map((customer) => ({
				kind: "customer" as const,
				...customer,
			}));
		},
		controls: {
			...(payload.controls ?? {}),
			concurrency: MIGRATION_RUN_CUSTOMER_CONCURRENCY,
			checkpointDryRun: true,
		},
	});

	const processed = summary?.processed ?? 0;
	ctx.logger.info("run-migration-chunk: done", {
		data: {
			migrationRunId: payload.migrationRunId,
			pageIndex: payload.pageIndex,
			processed,
			failed: summary?.failed ?? 0,
		},
	});

	return { processed };
};
