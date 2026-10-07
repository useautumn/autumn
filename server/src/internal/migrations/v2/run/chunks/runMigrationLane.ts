import type { MigrationSegment } from "./carveMigrationSegments.js";
import {
	iterateMigrationChunks,
	type MigrationChunkRunner,
	type MigrationChunkRunResult,
} from "./iterateMigrationChunks.js";

/** One lane walks its segments back to back with the serial chunk loop, so
 * the next chunk starts the moment the previous one settles. */
export const runMigrationLane = async ({
	segments,
	isCancelRequested,
	runChunk,
}: {
	segments: MigrationSegment[];
	isCancelRequested: () => Promise<boolean>;
	runChunk: MigrationChunkRunner;
}): Promise<MigrationChunkRunResult> => {
	let processed = 0;
	let chunks = 0;
	for (const segment of segments) {
		const walk = await iterateMigrationChunks({
			segment,
			firstChunkIndex: chunks,
			isCancelRequested,
			runChunk,
		});
		processed += walk.processed;
		chunks += walk.chunks;
		if (walk.canceled) return { processed, chunks, canceled: true };
	}
	return { processed, chunks, canceled: false };
};
