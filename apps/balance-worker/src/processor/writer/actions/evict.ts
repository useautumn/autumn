import type { PartitionWriterScope } from "../types/partitionWriter.js";

/** Drops the customer's resident rows; a subject pinned by an in-flight commit goes when that commit releases it. */
export async function evict({
	scope,
	customerKey,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
}): Promise<void> {
	const { state } = scope;
	// Set before any await: a flush landing from here on must not write these rows as the customer's snapshot.
	state.evicting.add(customerKey);
	try {
		// The next command re-reads Postgres, so the worker's own writes must be there first.
		await state.storeCompletion;
		state.subjects.evictCustomer({ customerKey });
	} finally {
		state.evicting.delete(customerKey);
	}
}
