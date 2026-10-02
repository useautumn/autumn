/** The DELETE an evict owes `subject_snapshots`, landed on the customer's partition lane. */
export type EvictDeletes = {
	/** Resolves once the customer's rows are gone; rejects if the DELETE could not land, so the evict is retried. */
	deleteCustomer(params: {
		topic: string;
		partition: number;
		customerKey: string;
	}): Promise<void>;
};
