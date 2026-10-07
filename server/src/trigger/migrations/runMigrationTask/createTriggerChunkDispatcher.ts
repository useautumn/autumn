import { runs, wait } from "@trigger.dev/sdk/v3";
import type {
	MigrationChunkDispatcher,
	MigrationChunkOutcome,
} from "@/internal/migrations/v2/run/types/migrationChunkDispatcher.js";
import {
	MIGRATION_CHUNK_POLL_SECONDS,
	migrationChunkIdempotencyKey,
} from "@/trigger/migrations/migrationTaskQueue.js";
import { runMigrationChunkTask } from "@/trigger/migrations/runMigrationChunkTask/runMigrationChunkTask.js";

type ChunkRunHandle = Awaited<ReturnType<typeof runMigrationChunkTask.trigger>>;

const pollChunkRun = async (
	handle: ChunkRunHandle,
): Promise<MigrationChunkOutcome | undefined> => {
	const run = await runs.retrieve(handle);
	if (!run.isCompleted) return undefined;
	if (run.isSuccess && run.output) return { ok: true, result: run.output };
	return {
		ok: false,
		error: new Error(run.error?.message ?? `chunk run ${run.id} ${run.status}`),
	};
};

/** Chunks run as fire-and-forget tasks the parent polls every few seconds. */
export const createTriggerChunkDispatcher = (): MigrationChunkDispatcher => ({
	start: async (payload) => {
		const handle = await runMigrationChunkTask.trigger(payload, {
			idempotencyKey: migrationChunkIdempotencyKey(payload),
			idempotencyKeyTTL: "7d",
			concurrencyKey: payload.migrationRunId,
		});
		return { poll: () => pollChunkRun(handle) };
	},
	idle: () => wait.for({ seconds: MIGRATION_CHUNK_POLL_SECONDS }),
});
