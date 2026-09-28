import type { PartitionWriterScope } from "../types/partitionWriter.js";

/** Drops the customer's resident rows; a subject pinned by an in-flight commit goes when that commit releases it. */
export async function evict({
	scope,
	customerKey,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
}): Promise<void> {
	// The next command re-reads Postgres, so the worker's own writes must be there first.
	await scope.state.storeCompletion;
	scope.state.subjects.evictCustomer({ customerKey });
}
