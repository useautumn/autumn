import type { MeteringIdentity } from "@autumn/balance-engine";

/** A customer or entity the batch moved, and the last offset that moved it. */
export type CacheSubjectRef = {
	identity: MeteringIdentity;
	logOffset: bigint;
};
