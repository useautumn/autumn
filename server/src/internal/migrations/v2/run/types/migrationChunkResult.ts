import type { BatchMigrationRejection } from "../../batchOperations/types/index.js";

/** What one chunk task reports back. */
export type MigrationChunkResult = { processed: number };

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
