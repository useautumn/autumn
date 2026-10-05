/** Each partition's commit position as a forward-only 64-bit cell in shared memory, plus its failure count. One
 *  writer at a time issues sequence numbers, in one unbroken block, so a reported range only covers its own. */
import type { CommitPositionSink } from "../../processor/writer/types/commitPositionSink.js";
import { CommitPositionsOverlapError } from "./errors.js";
import type {
	CommitPositions,
	CommittedPosition,
	FailedPosition,
} from "./types/commitPositions.js";

type IssuingSink = {
	firstSeq: number;
	lastSeq: number;
	/** Everything up to here is committed or reported failed. */
	settledSeq: number;
	/** Closed, or replaced by a later writer: it issues nothing more and its reports are ignored. */
	retired: boolean;
};

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
	const issuing = new Array<IssuingSink | null>(partitionCount).fill(null);
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
		const sink: IssuingSink = {
			firstSeq: 0,
			lastSeq: 0,
			settledSeq: 0,
			retired: false,
		};

		function claimIssuing(): void {
			const current = issuing[partition];
			if (current === sink) return;
			const unconfirmed =
				current !== null &&
				!current.retired &&
				current.lastSeq > current.settledSeq;
			if (sink.retired || unconfirmed)
				throw new CommitPositionsOverlapError({ partition });
			if (current) current.retired = true;
			issuing[partition] = sink;
		}

		function nextSeq(): number {
			claimIssuing();
			const seq = (issued[partition] as number) + 1;
			issued[partition] = seq;
			if (sink.firstSeq === 0) {
				sink.firstSeq = seq;
				sink.settledSeq = seq - 1;
			}
			sink.lastSeq = seq;
			return seq;
		}

		function committed({ seq }: { seq: number }): void {
			if (sink.retired) return;
			sink.settledSeq = Math.max(sink.settledSeq, seq);
			if (seq <= readCommitPosition({ partition })) return;
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
			if (sink.retired) return;
			// Only this writer's own block: an earlier writer's numbers are not its to fail.
			const from = Math.max(seq, sink.firstSeq - 1);
			if (lastSeq <= from) return;
			sink.settledSeq = Math.max(sink.settledSeq, lastSeq);
			// Counted before any listener queues the failure, so a reader never releases past one still on its way.
			Atomics.add(failures, partition, 1);
			for (const listener of failedListeners)
				listener({ partition, seq: from, lastSeq, cause });
		}

		function closed(): void {
			sink.retired = true;
			sink.settledSeq = sink.lastSeq;
		}

		return { nextSeq, committed, failedAbove, closed };
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
