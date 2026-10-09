import { allStored } from "../pendingMutations.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";

/** Drops the customer's resident rows; a subject pinned by an unapplied write goes once the store has it. */
export async function evict({
	scope,
	customerKey,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
}): Promise<void> {
	// The next command re-reads Postgres, so the worker's own writes must be there first.
	await allStored({ state: scope.state });
	scope.state.subjects.evictCustomer({ customerKey });
}
