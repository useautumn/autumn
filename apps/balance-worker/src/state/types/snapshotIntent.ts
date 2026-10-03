import type { SubjectState } from "@autumn/balance-engine";

/** What the writer can say about a customer's snapshot rows as a flush lands: the rows every subject of it leaves, or nothing provable. */
export type SnapshotIntentEntry =
	| {
			states: SubjectState[];
			baselineAt: number;
			/** The last log offset the states include; absent, the flush's own last record is. */
			logOffset?: bigint;
	  }
	| "delete";

/** By the engine's customer key (`meteringIdentityToPartitionKey`). Absent on a replay: the log does not carry state. */
export type SnapshotIntent = Map<string, SnapshotIntentEntry>;
