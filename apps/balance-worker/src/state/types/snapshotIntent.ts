import type { SubjectState } from "@autumn/balance-engine";

export type SnapshotIntentEntry =
	| {
			states: SubjectState[];
			baselineAt: number;
			logOffsets?: ReadonlyMap<string, bigint>;
	  }
	| "delete";

export type SnapshotIntent = Map<string, SnapshotIntentEntry>;
