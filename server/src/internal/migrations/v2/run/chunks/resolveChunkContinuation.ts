import type { MigrationChunkResult } from "./iterateMigrationChunks.js";

export type MigrationChunkContinuation =
	| { kind: "stopped" }
	| { kind: "exhausted" }
	| { kind: "continue"; cursor: string };

/** What one settled chunk means for the keyset it was walking. */
export const resolveChunkContinuation = (
	chunk: MigrationChunkResult,
): MigrationChunkContinuation => {
	if (chunk.completion === "stopped") return { kind: "stopped" };
	if (chunk.completion === "exhausted") return { kind: "exhausted" };
	if (chunk.processed === 0) {
		throw new Error("Migration chunk made no progress before continuation");
	}
	if (!chunk.cursor) {
		throw new Error("Migration chunk did not return a cursor for continuation");
	}
	return { kind: "continue", cursor: chunk.cursor };
};
