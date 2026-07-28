/** One claimed customer flowing through a page. Preview fields feed the
 * Tinybird item events; `id` also keys the cache bust. */
export type BatchMigrationPageCustomer = {
	internalId: string;
	id: string | null;
	name: string | null;
	email: string | null;
};

export type BatchMigrationPageResult = {
	/** Customers with a matching customer product — mutated and marked succeeded. */
	succeeded: BatchMigrationPageCustomer[];
	/** Customers with no batch-eligible customer product — marked skipped;
	 * retryable via retry_item_statuses through the per-customer lane. */
	skipped: BatchMigrationPageCustomer[];
};

export type BatchMigrationExecutionSummary = {
	pages: number;
	succeeded: number;
	skipped: number;
};

/** One executeBatchMigrationChunk invocation. Contract-compatible with the
 * trigger chunk runner: slice_complete + cursor means "respawn me from here". */
export type BatchMigrationChunkResult = {
	processed: number;
	completion: "exhausted" | "slice_complete" | "stopped";
	cursor: string | null;
	summary: BatchMigrationExecutionSummary;
};
