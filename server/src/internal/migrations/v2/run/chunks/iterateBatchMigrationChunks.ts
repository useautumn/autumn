import type { BatchMigrationChunkResult } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";

export type BatchMigrationChunkRunner = (args: {
	chunkIndex: number;
	cursor: string | undefined;
}) => Promise<BatchMigrationChunkResult>;

export type BatchMigrationChunksResult = {
	processed: number;
	/** Pages executed across every chunk. */
	pages: number;
	canceled: boolean;
};

/** Drives budgeted batch chunks (each runs up to maxPages then yields with
 * slice_complete + cursor) until the filter is exhausted or canceled. */
export const iterateBatchMigrationChunks = async ({
	runChunk,
}: {
	runChunk: BatchMigrationChunkRunner;
}): Promise<BatchMigrationChunksResult> => {
	let processed = 0;
	let pages = 0;
	let cursor: string | undefined;
	let chunkIndex = 0;

	while (true) {
		const result = await runChunk({ chunkIndex, cursor });
		processed += result.processed;
		pages += result.summary.pages;

		if (result.completion === "stopped")
			return { processed, pages, canceled: true };
		if (result.completion === "exhausted")
			return { processed, pages, canceled: false };

		cursor = result.cursor ?? cursor;
		chunkIndex += 1;
	}
};
