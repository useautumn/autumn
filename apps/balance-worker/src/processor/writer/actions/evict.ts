import { allStored } from "../pendingMutations.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";

/** Hides the customer's resident rows at once, so no command decides on them again, and drops them once the store holds the
 *  writes before it. A load of the customer meanwhile waits for the same (`waitForEvicted`), so it never reads Postgres without them. */
export async function evict({
	scope,
	customerKey,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
}): Promise<void> {
	const { subjects } = scope.state;
	subjects.hideCustomer({ customerKey });
	await allStored({ state: scope.state });
	subjects.evictCustomer({ customerKey });
}
