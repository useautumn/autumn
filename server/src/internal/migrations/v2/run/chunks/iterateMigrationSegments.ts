import type {
	MigrationChunkResult,
	MigrationChunkRunResult,
} from "./iterateMigrationChunks.js";

/** Keyset range `[floor, cursor)` on internal_id; an unset floor walks to the end. */
export type MigrationSegment = { cursor?: string; floor?: string };

export type MigrationSegmentChunk = MigrationSegment & { chunkIndex: number };

/** Keeps up to `partitions` chunks in flight over disjoint keyset segments.
 * Each round settles fully before the next, so a failure never races live siblings. */
export const iterateMigrationSegments = async ({
	partitions,
	isCancelRequested,
	loadIdPage,
	runRound,
}: {
	partitions: number;
	isCancelRequested: () => Promise<boolean>;
	loadIdPage: (args: {
		cursor?: string;
	}) => Promise<{ ids: string[]; isLastPage: boolean }>;
	runRound: (
		chunks: MigrationSegmentChunk[],
	) => Promise<MigrationChunkResult[]>;
}): Promise<MigrationChunkRunResult> => {
	let processed = 0;
	let chunks = 0;
	let walkCursor: string | undefined;
	let walkExhausted = false;
	let active: MigrationSegment[] = [];

	const carveSegment = async (): Promise<MigrationSegment | undefined> => {
		const { ids, isLastPage } = await loadIdPage({ cursor: walkCursor });
		const segment: MigrationSegment = {
			cursor: walkCursor,
			floor: isLastPage ? undefined : ids.at(-1),
		};
		walkExhausted = isLastPage;
		walkCursor = ids.at(-1) ?? walkCursor;
		return ids.length > 0 ? segment : undefined;
	};

	while (true) {
		if (await isCancelRequested()) return { processed, chunks, canceled: true };

		while (active.length < partitions && !walkExhausted) {
			const segment = await carveSegment();
			if (segment) active.push(segment);
		}
		if (active.length === 0) return { processed, chunks, canceled: false };

		const round = active.map((segment) => ({
			...segment,
			chunkIndex: chunks++,
		}));
		const results = await runRound(round);

		const continuing: MigrationSegment[] = [];
		let canceled = false;
		for (const [index, chunk] of round.entries()) {
			const result = results[index];
			if (!result) throw new Error("Migration round returned too few results");
			processed += result.processed;

			if (result.completion === "stopped") canceled = true;
			if (result.completion !== "slice_complete") continue;
			if (result.processed === 0)
				throw new Error("Migration chunk made no progress before continuation");
			if (!result.cursor)
				throw new Error(
					"Migration chunk did not return a cursor for continuation",
				);
			continuing.push({ cursor: result.cursor, floor: chunk.floor });
		}

		if (canceled) return { processed, chunks, canceled: true };
		active = continuing;
	}
};
