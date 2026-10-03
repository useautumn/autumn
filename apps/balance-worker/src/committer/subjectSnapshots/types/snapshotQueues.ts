import type { SubjectState } from "@autumn/balance-engine";
import type { DeletedSubjectSnapshot } from "@autumn/postgres";

/**
 * What the partition's lane writes to `subject_snapshots` outside a flush: an evict's DELETE, then the refreshes that
 * rebuild the rows. Both are synchronous enqueues a request never waits on; they land on the lane's next ticks.
 */
export type SnapshotQueues = {
	/** Every row of the customer goes; a refresh of it still pending goes with them, the evict will queue a fresh one. */
	enqueueDelete(params: {
		topic: string;
		partition: number;
		customerKey: string;
	}): void;
	/** The rows the customer's DELETE removed, once the lane tick carrying it has run; none, at once, when no DELETE waits or is in flight. */
	deleteLanded(params: {
		topic: string;
		partition: number;
		customerKey: string;
	}): Promise<DeletedSubjectSnapshot[]>;
	/** One subject's rows read whole after an evict, written as its row so the next cold load is a hit; lands after any DELETE pending for the customer. */
	enqueueRefresh(params: {
		topic: string;
		partition: number;
		state: SubjectState;
		baselineAt: number;
	}): void;
};
