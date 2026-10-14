import type { MeteringIdentity } from "@autumn/balance-engine";

export type CacheSubjectRef = {
	identity: MeteringIdentity;
	logOffset: bigint;
	oldestOccurredAt: number;
	customerVersion: bigint | null;
};
