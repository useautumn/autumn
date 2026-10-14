import type { AtomRecord } from "../../types/atomRecord.js";

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
