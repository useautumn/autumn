import type { IterateScopeCompletion } from "@/internal/migrations/v2/run/orchestrators/iterateScope.js";

export type MigrationChunkResult = {
	processed: number;
	completion: IterateScopeCompletion;
	cursor: string | null;
};

export type MigrationChunkRunResult = {
	processed: number;
	chunks: number;
	canceled: boolean;
};

export const runMigrationInChunks = async ({
	limit,
	isCancelRequested,
	runChunk,
}: {
	limit?: number;
	isCancelRequested: () => Promise<boolean>;
	runChunk: (args: {
		limit: number | undefined;
		chunkIndex: number;
		cursor: string | undefined;
	}) => Promise<MigrationChunkResult>;
}): Promise<MigrationChunkRunResult> => {
	let processed = 0;
	let chunks = 0;
	let cursor: string | undefined;

	while (limit === undefined || processed < limit) {
		if (await isCancelRequested()) {
			return { processed, chunks, canceled: true };
		}

		const remainingLimit =
			limit === undefined ? undefined : Math.max(0, limit - processed);
		const chunk = await runChunk({
			limit: remainingLimit,
			chunkIndex: chunks,
			cursor,
		});
		chunks++;
		processed += chunk.processed;

		if (chunk.completion === "stopped") {
			return { processed, chunks, canceled: true };
		}
		if (chunk.completion === "exhausted") break;
		if (chunk.processed === 0) {
			throw new Error("Migration chunk made no progress before continuation");
		}
		if (!chunk.cursor) {
			throw new Error(
				"Migration chunk did not return a cursor for continuation",
			);
		}
		cursor = chunk.cursor;
	}

	return { processed, chunks, canceled: false };
};
