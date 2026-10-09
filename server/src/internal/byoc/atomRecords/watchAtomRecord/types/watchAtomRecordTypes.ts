import type { AtomRecord } from "../../types/atomRecord.js";

/** One read of the deployer: the record as it now stands (null once a delete finished), or the deployer did not answer. */
export type AtomRecordPoll<T extends AtomRecord> =
	| { ok: true; record: T | null }
	| { ok: false; error: unknown };

export type WatchAtomRecordOutcome =
	| "connected"
	| "failed"
	| "teardown_required"
	| "gone"
	| "timed_out";

export type WatchAtomRecordStep =
	| { settled: true; outcome: WatchAtomRecordOutcome }
	| { settled: false; waitSeconds: number };
