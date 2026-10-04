/**
 * The commit positions of this task's partitions (serial-decide arm D): one 64-bit cell per partition index on
 * a SharedArrayBuffer the I/O workers read, written only by the main thread as each partition's writer settles
 * a batch. The board also numbers each partition's writes, so a writer rebuilt after a recovery or a re-acquire
 * continues above everything its predecessor issued and a held reply can never match a later writer's number.
 * A failure moves nothing: it names the range of sequence numbers whose held replies must be answered with it.
 * Its FAIL frames travel behind whatever each lane's ring already holds while the cell is read at once, so the
 * board also counts failures per partition in shared memory: a worker releases nothing on a partition until it
 * has seen as many FAIL frames as the board has issued.
 */
import type { PositionSink } from "../processor/writer/types/partitionWriter.js";

export type CommittedPosition = { partition: number; seq: number };
export type FailedPosition = {
	partition: number;
	/** The commit position: nothing above it, up to `lastSeq`, reached the log. */
	seq: number;
	lastSeq: number;
	cause: unknown;
};

export type PositionBoard = {
	/** BigInt64 per partition index: the latest sequence number the log acknowledged. */
	readonly cells: SharedArrayBuffer;
	/** Int32 per partition index: how many failures the partition has published. */
	readonly failGenerations: SharedArrayBuffer;
	sinkFor(params: { partition: number }): PositionSink;
	readCommitPos(params: { partition: number }): number;
	onCommitted(listener: (position: CommittedPosition) => void): () => void;
	onFailedAbove(listener: (position: FailedPosition) => void): () => void;
};

export const POSITION_CELL_BYTES = 8;

export function createPositionBoard({
	config,
}: {
	config: { partitionCount: number };
}): PositionBoard {
	if (!Number.isSafeInteger(config.partitionCount) || config.partitionCount < 1)
		throw new RangeError("partitionCount must be a positive integer");
	const cells = new SharedArrayBuffer(
		config.partitionCount * POSITION_CELL_BYTES,
	);
	const positions = new BigInt64Array(cells);
	const failGenerations = new SharedArrayBuffer(config.partitionCount * 4);
	const failures = new Int32Array(failGenerations);
	// The last sequence number handed out per partition, across every writer it has had.
	const issued = new Array<number>(config.partitionCount).fill(0);
	const committedListeners = new Set<(position: CommittedPosition) => void>();
	const failedListeners = new Set<(position: FailedPosition) => void>();

	function assertPartition({ partition }: { partition: number }): void {
		if (
			!Number.isSafeInteger(partition) ||
			partition < 0 ||
			partition >= config.partitionCount
		)
			throw new RangeError(
				`Partition ${partition} is outside this task's ${config.partitionCount}`,
			);
	}

	function readCommitPos({ partition }: { partition: number }): number {
		assertPartition({ partition });
		return Number(Atomics.load(positions, partition));
	}

	function sinkFor({ partition }: { partition: number }): PositionSink {
		assertPartition({ partition });
		function open(): { commitPos: number; lastSeq: number } {
			return {
				commitPos: readCommitPos({ partition }),
				lastSeq: issued[partition],
			};
		}
		function nextSeq(): number {
			issued[partition] += 1;
			return issued[partition];
		}
		function committed({ seq }: { seq: number }): void {
			Atomics.store(positions, partition, BigInt(seq));
			for (const listener of committedListeners) listener({ partition, seq });
		}
		function failedAbove({
			seq,
			lastSeq,
			cause,
		}: {
			seq: number;
			lastSeq: number;
			cause: unknown;
		}): void {
			// Counted before the listeners queue the frames, so no worker releases past a FAIL still in its ring.
			Atomics.add(failures, partition, 1);
			for (const listener of failedListeners)
				listener({ partition, seq, lastSeq, cause });
		}
		function closed({
			lastSeq,
			cause,
		}: {
			lastSeq: number;
			cause: unknown;
		}): void {
			failedAbove({ seq: readCommitPos({ partition }), lastSeq, cause });
		}
		return { open, nextSeq, committed, failedAbove, closed };
	}

	function onCommitted(
		listener: (position: CommittedPosition) => void,
	): () => void {
		committedListeners.add(listener);
		return () => {
			committedListeners.delete(listener);
		};
	}

	function onFailedAbove(
		listener: (position: FailedPosition) => void,
	): () => void {
		failedListeners.add(listener);
		return () => {
			failedListeners.delete(listener);
		};
	}

	return {
		cells,
		failGenerations,
		sinkFor,
		readCommitPos,
		onCommitted,
		onFailedAbove,
	};
}
