import { allStored } from "../pendingMutations.js";
import type { PartitionWriterScope } from "../types/partitionWriter.js";

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
