import type { CommitPositionSink } from "../../../processor/writer/types/commitPositionSink.js";

export type CommittedPosition = { partition: number; seq: number };
export type FailedPosition = {
	partition: number;
	/** The commit position: nothing above it, up to `lastSeq`, reached the log. */
	seq: number;
	lastSeq: number;
	cause: unknown;
};

/** This task's commit positions, one per partition, readable from any thread. */
export type CommitPositions = {
	/** BigInt64 per partition: the latest sequence number the log acknowledged. */
	readonly cells: SharedArrayBuffer;
	/** Int32 per partition: how many failures the partition has published. */
	readonly failureCounts: SharedArrayBuffer;
	sinkFor(params: { partition: number }): CommitPositionSink;
	readCommitPosition(params: { partition: number }): number;
	onCommitted(listener: (position: CommittedPosition) => void): () => void;
	onFailedAbove(listener: (position: FailedPosition) => void): () => void;
};
