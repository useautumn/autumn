import type { SubjectState } from "@autumn/balance-engine";

/**
 * What the partition's lane writes to `subject_snapshots` outside a flush: an evict's DELETE, a cold load's backfill.
 * Both are synchronous enqueues a request never waits on; they land on the lane's next tick, after every flush decided before.
 */
export type SnapshotLaneWrites = {
	enqueueDelete(params: {
		topic: string;
		partition: number;
		customerKey: string;
	}): void;
	/** The rows a full read answered, written back so the next cold load is a hit; a later DELETE for the customer replaces it. */
	enqueueBackfill(params: {
		topic: string;
		partition: number;
		customerKey: string;
		states: SubjectState[];
		baselineAt: number;
	}): void;
};
