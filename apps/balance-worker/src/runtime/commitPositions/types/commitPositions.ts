import type { CommitPositionSink } from "../../../processor/writer/types/commitPositionSink.js";

export type CommittedPosition = { partition: number; seq: number };
export type FailedPosition = {
	partition: number;
	seq: number;
	lastSeq: number;
	cause: unknown;
};

export type CommitPositions = {
	readonly cells: SharedArrayBuffer;
	readonly failureCounts: SharedArrayBuffer;
	sinkFor(params: { partition: number }): CommitPositionSink;
	readCommitPosition(params: { partition: number }): number;
	onCommitted(listener: (position: CommittedPosition) => void): () => void;
	onFailedAbove(listener: (position: FailedPosition) => void): () => void;
};
