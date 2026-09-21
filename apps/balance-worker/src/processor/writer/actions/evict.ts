import type { PartitionWriterScope } from "../types/partitionWriter.js";
import { waitForPendingCommits } from "./decide.js";

/** Commits already in flight land first; a command arriving meanwhile pins its subject, and the map drops that one on unpin. */
export async function evict({
	scope,
	customerKey,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
}): Promise<void> {
	await waitForPendingCommits({ scope, customerKey });
	scope.state.subjects.evictCustomer({ customerKey });
}
