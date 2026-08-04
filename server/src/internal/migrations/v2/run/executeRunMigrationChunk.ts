import { isMigrationCancelRequested } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type RunMigrationResult,
	runPreparedMigration,
} from "./runMigration.js";
import type { RunMigrationChunkPayload } from "./types/migrationRunPayloads.js";
import {
	createMigrationChunkScheduler,
	MIGRATION_RUN_CUSTOMER_CONCURRENCY,
} from "./utils/migrationRunConstants.js";

/** One chunk's workload (the child side of the process boundary): cancel
 * check, snapshot identity check, then a time-sliced run from the cursor. */
export const executeRunMigrationChunk = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: RunMigrationChunkPayload;
}): Promise<RunMigrationResult> => {
	if (
		await isMigrationCancelRequested({ migrationRunId: payload.migrationRunId })
	) {
		return {
			processed: 0,
			completion: "stopped",
			cursor: payload.cursor ?? null,
		};
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
			chunkIndex: payload.chunkIndex,
			limit: payload.controls?.limit,
		},
	});

	const result = await runPreparedMigration({
		ctx,
		migration: payload.migration,
		migrationRunId: payload.migrationRunId,
		dryRun: payload.dryRun,
		controls: {
			...(payload.controls ?? {}),
			concurrency: MIGRATION_RUN_CUSTOMER_CONCURRENCY,
			checkpointDryRun: true,
		},
		scheduler: createMigrationChunkScheduler(),
		includeFilterCount: false,
		afterInternalId: payload.cursor,
	});

	ctx.logger.info("run-migration-chunk: done", {
		data: {
			migrationRunId: payload.migrationRunId,
			chunkIndex: payload.chunkIndex,
			processed: result.processed,
			completion: result.completion,
		},
	});

	return result;
};
