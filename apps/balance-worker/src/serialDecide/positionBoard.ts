/**
 * The commit positions of this task's partitions (serial-decide arm D): one Int32 per partition index on a
 * SharedArrayBuffer the I/O workers read, written only by the main thread as each partition's writer settles
 * a batch. A failure moves nothing: it names the position every held reply above must fail from.
 */
import type { PositionSink } from "../processor/writer/types/partitionWriter.js";

export type CommittedPosition = { partition: number; seq: number };
export type FailedPosition = { partition: number; seq: number; cause: unknown };

export type PositionBoard = {
	/** Int32 per partition index: the latest sequence number the log acknowledged. */
	readonly cells: SharedArrayBuffer;
	sinkFor(params: { partition: number }): PositionSink;
	readCommitPos(params: { partition: number }): number;
	onCommitted(listener: (position: CommittedPosition) => void): () => void;
	onFailedAbove(listener: (position: FailedPosition) => void): () => void;
};

export function createPositionBoard({
	config,
}: {
	config: { partitionCount: number };
}): PositionBoard {
	if (!Number.isSafeInteger(config.partitionCount) || config.partitionCount < 1)
		throw new RangeError("partitionCount must be a positive integer");
	const cells = new SharedArrayBuffer(config.partitionCount * 4);
	const positions = new Int32Array(cells);
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

	function sinkFor({ partition }: { partition: number }): PositionSink {
		assertPartition({ partition });
		function committed({ seq }: { seq: number }): void {
			Atomics.store(positions, partition, seq | 0);
			for (const listener of committedListeners) listener({ partition, seq });
		}
		function failedAbove({
			seq,
			cause,
		}: {
			seq: number;
			cause: unknown;
		}): void {
			for (const listener of failedListeners)
				listener({ partition, seq, cause });
		}
		return { committed, failedAbove };
	}

	function readCommitPos({ partition }: { partition: number }): number {
		assertPartition({ partition });
		return Atomics.load(positions, partition);
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

	return { cells, sinkFor, readCommitPos, onCommitted, onFailedAbove };
}
