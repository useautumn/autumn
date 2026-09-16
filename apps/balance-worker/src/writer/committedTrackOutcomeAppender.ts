import type { TrackOutcome } from "@autumn/balance-engine";

/** May be thrown only when the appender proves that no outcome was committed. */
export class TrackOutcomeBatchNotCommittedError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Track outcome batch was not committed", { cause });
		this.name = "TrackOutcomeBatchNotCommittedError";
	}
}

export type CommittedTrackOutcomeAppender = {
	/** Atomically commits all outcomes contiguously and returns the first record's offset. */
	appendCommitted({
		topic,
		partition,
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly TrackOutcome[];
	}): Promise<{ baseOffset: bigint }>;
};
