import type { TrackOutcome } from "@autumn/balance-engine";

export class TrackOutcomeBatchNotCommittedError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Track outcome batch was not committed", { cause });
		this.name = "TrackOutcomeBatchNotCommittedError";
	}
}

export type CommittedTrackOutcomeAppender = {
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
