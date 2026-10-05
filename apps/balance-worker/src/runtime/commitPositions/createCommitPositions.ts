/** Each partition's commit position as a forward-only 64-bit cell in shared memory, plus its failure count;
 *  sequence numbers continue across a partition's writers, so a held reply never matches a later writer's. */
import type { CommitPositionSink } from "../../processor/writer/types/commitPositionSink.js";
import type {
	CommitPositions,
	CommittedPosition,
	FailedPosition,
} from "./types/commitPositions.js";

const CELL_BYTES = 8;
const COUNT_BYTES = 4;

export function createCommitPositions({
	config,
}: {
	config: { partitionCount: number };
}): CommitPositions {
	const { partitionCount } = config;
	if (!Number.isSafeInteger(partitionCount) || partitionCount < 1)
		throw new RangeError("partitionCount must be a positive integer");
	const cells = new SharedArrayBuffer(partitionCount * CELL_BYTES);
	const positions = new BigInt64Array(cells);
	const failureCounts = new SharedArrayBuffer(partitionCount * COUNT_BYTES);
	const failures = new Int32Array(failureCounts);
	// The last sequence number handed out per partition, across every writer it has had.
	const issued = new Array<number>(partitionCount).fill(0);
	const committedListeners = new Set<(position: CommittedPosition) => void>();
	const failedListeners = new Set<(position: FailedPosition) => void>();

	function assertPartition({ partition }: { partition: number }): void {
		if (
			!Number.isSafeInteger(partition) ||
			partition < 0 ||
			partition >= partitionCount
		)
			throw new RangeError(
				`Partition ${partition} is outside this task's ${partitionCount}`,
			);
	}

	function readCommitPosition({ partition }: { partition: number }): number {
		assertPartition({ partition });
		return Number(Atomics.load(positions, partition));
	}

	function sinkFor({ partition }: { partition: number }): CommitPositionSink {
		assertPartition({ partition });
		let isOpen = true;

		function open(): { lastSeq: number } {
			return { lastSeq: issued[partition] as number };
		}

		function nextSeq(): number {
			const seq = (issued[partition] as number) + 1;
			issued[partition] = seq;
			return seq;
		}

		function committed({ seq }: { seq: number }): void {
			if (!isOpen || seq <= readCommitPosition({ partition })) return;
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
			if (!isOpen || lastSeq <= seq) return;
			// Counted before any listener queues the failure, so a reader never releases past one still on its way.
			Atomics.add(failures, partition, 1);
			for (const listener of failedListeners)
				listener({ partition, seq, lastSeq, cause });
		}

		function closed(): void {
			isOpen = false;
		}

		return { open, nextSeq, committed, failedAbove, closed };
	}

	function onCommitted(
		listener: (position: CommittedPosition) => void,
	): () => void {
		function stopListening(): void {
			committedListeners.delete(listener);
		}
		committedListeners.add(listener);
		return stopListening;
	}

	function onFailedAbove(
		listener: (position: FailedPosition) => void,
	): () => void {
		function stopListening(): void {
			failedListeners.delete(listener);
		}
		failedListeners.add(listener);
		return stopListening;
	}

	return {
		cells,
		failureCounts,
		sinkFor,
		readCommitPosition,
		onCommitted,
		onFailedAbove,
	};
}
