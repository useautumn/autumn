import type { ProgressTracker } from "@autumn/kafka";
import type {
	RewoundPartition,
	UncommittedLandings,
} from "./types/uncommittedLandings.js";

type HeldSlices = {
	firstOffset: bigint;
	nextOffset: bigint;
	startedAtMs: number;
	endedAtMs: number;
};

/** Per partition, the slices handed to a job since its last commit: the work a rewind to that commit repeats. */
export function createUncommittedLandings({
	ctx,
	topic,
}: {
	ctx: { progress: Pick<ProgressTracker, "read"> };
	topic: string;
}): UncommittedLandings {
	const held = new Map<number, HeldSlices>();

	function readCommittedNext(partition: number): bigint | null {
		return ctx.progress.read({ topic, partition });
	}

	function isCommitted({
		partition,
		slices,
	}: {
		partition: number;
		slices: HeldSlices;
	}): boolean {
		const committedNext = readCommittedNext(partition);
		return committedNext !== null && committedNext >= slices.nextOffset;
	}

	function recordSlice({
		partition,
		firstOffset,
		nextOffset,
		startedAtMs,
		endedAtMs,
	}: Parameters<UncommittedLandings["recordSlice"]>[0]): void {
		const previous = held.get(partition);
		const continuesUncommitted =
			previous !== undefined &&
			firstOffset >= previous.nextOffset &&
			!isCommitted({ partition, slices: previous });
		held.set(
			partition,
			continuesUncommitted
				? { ...previous, nextOffset, endedAtMs }
				: { firstOffset, nextOffset, startedAtMs, endedAtMs },
		);
	}

	function takeRewound({
		partitions,
	}: {
		partitions: number[];
	}): RewoundPartition[] {
		const rewound: RewoundPartition[] = [];
		for (const partition of partitions) {
			const slices = held.get(partition);
			if (!slices || isCommitted({ partition, slices })) continue;
			const rewindsTo = readCommittedNext(partition) ?? slices.firstOffset;
			rewound.push({
				partition,
				records: Number(slices.nextOffset - rewindsTo),
				ranMs: slices.endedAtMs - slices.startedAtMs,
			});
		}
		held.clear();
		return rewound;
	}

	return { recordSlice, takeRewound };
}
