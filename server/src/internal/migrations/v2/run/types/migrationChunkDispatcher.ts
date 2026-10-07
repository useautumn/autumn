import type { MigrationChunkResult } from "./migrationChunkResult.js";
import type { RunMigrationChunkPayload } from "./migrationRunPayloads.js";

export type MigrationChunkOutcome =
	| { ok: true; result: MigrationChunkResult }
	| { ok: false; error: unknown };

export type StartedMigrationChunk = {
	/** `undefined` while the chunk is still running. */
	poll: () => Promise<MigrationChunkOutcome | undefined>;
};

/** How the parent starts chunks and passes time between polls. */
export type MigrationChunkDispatcher = {
	start: (payload: RunMigrationChunkPayload) => Promise<StartedMigrationChunk>;
	idle: () => Promise<void>;
};
