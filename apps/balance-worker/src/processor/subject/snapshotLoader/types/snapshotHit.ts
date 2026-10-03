import type { SubjectState } from "@autumn/balance-engine";

/** Why a row could not stand in for a full read; the batch log counts misses by it. */
export type SnapshotMissReason =
	| "absent"
	| "version"
	| "expired"
	| "parse"
	| "identity"
	| "asOf";

export type SnapshotHit =
	| { hit: true; state: SubjectState }
	| { hit: false; reason: SnapshotMissReason };
