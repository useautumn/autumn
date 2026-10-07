import { isMigrationCancelRequested } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationChunkRunResult } from "./chunks/iterateMigrationChunks.js";
import { runMigrationLane } from "./chunks/runMigrationLane.js";
import { executeRunMigrationChunk } from "./executeRunMigrationChunk.js";
import type { RunMigrationChunkRunner } from "./runMigrationInChunks.js";
import {
	buildRunMigrationChunkPayload,
	type RunMigrationLanePayload,
} from "./types/migrationRunPayloads.js";

/** One lane's workload (the child side of the process boundary): walk its
 * segments, dispatching each chunk through `runChunk`. */
export const executeRunMigrationLane = async ({
	ctx,
	payload,
	runChunk = (chunkPayload) =>
		executeRunMigrationChunk({ ctx, payload: chunkPayload }),
}: {
	ctx: AutumnContext;
	payload: RunMigrationLanePayload;
	runChunk?: RunMigrationChunkRunner;
}): Promise<MigrationChunkRunResult> => {
	ctx.logger.info("run-migration-lane: starting", {
		data: {
			migrationRunId: payload.migrationRunId,
			laneIndex: payload.laneIndex,
			segments: payload.segments.length,
		},
	});

	const result = await runMigrationLane({
		segments: payload.segments,
		isCancelRequested: () =>
			isMigrationCancelRequested({ migrationRunId: payload.migrationRunId }),
		runChunk: ({ limit, chunkIndex, cursor, floor }) =>
			runChunk(
				buildRunMigrationChunkPayload({
					ctx,
					migrationId: payload.migrationId,
					migrationRunId: payload.migrationRunId,
					dryRun: payload.dryRun,
					lazyRun: payload.lazyRun,
					migration: payload.migration,
					controls: payload.controls,
					limit,
					chunkIndex,
					laneIndex: payload.laneIndex,
					cursor,
					floor,
				}),
			),
	});

	ctx.logger.info("run-migration-lane: done", {
		data: {
			migrationRunId: payload.migrationRunId,
			laneIndex: payload.laneIndex,
			...result,
		},
	});
	return result;
};
