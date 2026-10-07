import type {
	MigrationChunkDispatcher,
	MigrationChunkOutcome,
} from "../types/migrationChunkDispatcher.js";
import type { MigrationChunkResult } from "../types/migrationChunkResult.js";
import type { RunMigrationChunkPayload } from "../types/migrationRunPayloads.js";

const IN_PROCESS_POLL_MS = 50;

/** Runs chunks as promises in this process; the parent polls them like task runs. */
export const createInProcessChunkDispatcher = ({
	runChunk,
}: {
	runChunk: (
		payload: RunMigrationChunkPayload,
	) => Promise<MigrationChunkResult>;
}): MigrationChunkDispatcher => ({
	start: async (payload) => {
		let outcome: MigrationChunkOutcome | undefined;
		runChunk(payload).then(
			(result) => {
				outcome = { ok: true, result };
			},
			(error) => {
				outcome = { ok: false, error };
			},
		);
		return { poll: async () => outcome };
	},
	idle: () => new Promise((resolve) => setTimeout(resolve, IN_PROCESS_POLL_MS)),
});
