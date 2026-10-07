import { task } from "@trigger.dev/sdk/v3";
import { executeRunMigrationLane } from "@/internal/migrations/v2/run/executeRunMigrationLane.js";
import { RunMigrationLanePayloadSchema } from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";
import {
	MIGRATION_TASK_RETRY,
	migrationChunkIdempotencyKey,
	migrationLaneQueue,
} from "@/trigger/migrations/migrationTaskQueue.js";
import { runMigrationChunkTask } from "@/trigger/migrations/runMigrationChunkTask/runMigrationChunkTask.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

/** Chains one lane's chunks with triggerAndWait: the next chunk starts the
 * moment the previous settles, independently of every other lane. */
export const runMigrationLaneTask = task({
	id: "run-migration-lane",
	queue: migrationLaneQueue,
	retry: MIGRATION_TASK_RETRY,
	// A lane spans its whole share of the run, like the parent.
	maxDuration: 86400,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = RunMigrationLanePayloadSchema.parse(rawPayload);
		const { ctx } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		return executeRunMigrationLane({
			ctx,
			payload,
			runChunk: (chunkPayload) =>
				runMigrationChunkTask
					.triggerAndWait(chunkPayload, {
						idempotencyKey: migrationChunkIdempotencyKey(chunkPayload),
						idempotencyKeyTTL: "7d",
					})
					.unwrap(),
		});
	},
});
