import type { MeteringIdentity } from "@autumn/balance-engine";

/** A customer or entity the batch moved, and the last offset that moved it. */
export type CacheSubjectRef = {
	identity: MeteringIdentity;
	logOffset: bigint;
	/** When the earliest change not yet pushed was requested, so a push can report how stale the Atom was. */
	oldestOccurredAt: number;
	/** On a customer, the offset of its latest evict among the changes this push covers; null when none of them was one. */
	customerVersion: bigint | null;
};
