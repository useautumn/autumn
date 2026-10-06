import type { SubjectState } from "@autumn/balance-engine";

/** What the writer can say about a customer's snapshot rows as a flush lands: the rows every subject of it leaves, or nothing provable. */
export type SnapshotIntentEntry =
	| {
			states: SubjectState[];
			/** Subjects whose row was written whole within the rewrite interval: this flush only marks it stale. */
			stale?: SubjectState[];
			baselineAt: number;
			/** Each refreshed subject's last included offset; absent, the flush's own last record is used. */
			logOffsets?: ReadonlyMap<string, bigint>;
	  }
	| "delete";

/** By the engine's customer key (`meteringIdentityToPartitionKey`). Absent on a replay: the log does not carry state. */
export type SnapshotIntent = Map<string, SnapshotIntentEntry>;
