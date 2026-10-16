import { BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS } from "@autumn/env/balanceWorkerConstants";

/** Retried rather than dropped, so the queue's redrive parks it in the DLQ: replaying could deduct twice, dropping could lose it. */
export class SpooledTrackTooOldError extends Error {
	constructor({ ageMs }: { ageMs: number }) {
		super(
			`Spooled track is ${ageMs}ms old, past the ${BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS}ms the balance worker's dedup covers`,
		);
		this.name = "SpooledTrackTooOldError";
	}
}

/** The worker could not say whether the original landed; retried until the age cap parks it in the DLQ. */
export class SpooledTrackFateUnknownError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super(
			`Could not settle whether the spooled track's original landed on the balance worker: ${cause instanceof Error ? cause.message : String(cause)}`,
			{ cause },
		);
		this.name = "SpooledTrackFateUnknownError";
	}
}
