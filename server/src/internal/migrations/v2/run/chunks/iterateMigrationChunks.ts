import type { BatchMigrationRejection } from "../../batchOperations/types/index.js";
import type { IterateScopeCompletion } from "../orchestrators/iterateScope.js";
import type { MigrationSegment } from "./carveMigrationSegments.js";
import { resolveChunkContinuation } from "./resolveChunkContinuation.js";

export type MigrationChunkResult = {
	processed: number;
	completion: IterateScopeCompletion;
	cursor: string | null;
};

export type MigrationRunLane = "batch" | "per_customer";

export type MigrationChunkRunResult = {
	processed: number;
	chunks: number;
	canceled: boolean;
	/** Stamped by runMigrationInChunks after the lane decision. */
	lane?: MigrationRunLane;
	/** Why the batch lane declined, when it did. */
	rejections?: BatchMigrationRejection[];
};

export type MigrationChunkRunner = (args: {
	limit: number | undefined;
	chunkIndex: number;
	cursor: string | undefined;
	floor: string | undefined;
}) => Promise<MigrationChunkResult>;

/** Walks one keyset segment chunk by chunk, each continuing from the last
 * cursor. The default segment is the whole keyset: today's serial run. */
export const iterateMigrationChunks = async ({
	limit,
	segment = {},
	firstChunkIndex = 0,
	isCancelRequested,
	runChunk,
}: {
	limit?: number;
	segment?: MigrationSegment;
	firstChunkIndex?: number;
	isCancelRequested: () => Promise<boolean>;
	runChunk: MigrationChunkRunner;
}): Promise<MigrationChunkRunResult> => {
	let processed = 0;
	let chunks = 0;
	let cursor = segment.cursor;

	while (limit === undefined || processed < limit) {
		if (await isCancelRequested()) {
			return { processed, chunks, canceled: true };
		}

		const remainingLimit =
			limit === undefined ? undefined : Math.max(0, limit - processed);

		const chunk = await runChunk({
			limit: remainingLimit,
			chunkIndex: firstChunkIndex + chunks,
			cursor,
			floor: segment.floor,
		});

		chunks++;
		processed += chunk.processed;

		const next = resolveChunkContinuation(chunk);
		if (next.kind === "stopped") return { processed, chunks, canceled: true };
		if (next.kind === "exhausted") break;
		cursor = next.cursor;
	}

	return { processed, chunks, canceled: false };
};
