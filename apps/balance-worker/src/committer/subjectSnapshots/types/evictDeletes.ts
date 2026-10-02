/** The DELETE an evict owes `subject_snapshots`, landed on the customer's partition lane. */
export type EvictDeletes = {
	/** Synchronous: a request never waits on it. The DELETE lands on the lane's next tick, after every flush decided before. */
	enqueue(params: {
		topic: string;
		partition: number;
		customerKey: string;
	}): void;
};
