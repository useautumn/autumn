import type { PartitionWriterScope } from "../types/partitionWriter.js";

/** Drops the customer's resident rows; a subject pinned by an in-flight commit goes when that commit releases it. */
export async function evict({
	scope,
	customerKey,
	deferSnapshotDelete,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
	deferSnapshotDelete?: (deleted: Promise<void>) => void;
}): Promise<void> {
	const { state, config } = scope;
	// Set before any await: a flush landing from here on must not write these rows as the customer's snapshot.
	state.evicting.add(customerKey);
	try {
		// The next command re-reads Postgres, so the worker's own writes must be there first.
		await state.storeCompletion;
		state.subjects.evictCustomer({ customerKey });
		const deletes = scope.ctx.stateStore.evictDeletes;
		if (!deletes) return;
		// Handed to the partition's lane now, so it lands after every flush decided before this evict.
		const deleted = deletes.deleteCustomer({
			topic: config.topic,
			partition: config.partition,
			customerKey,
		});
		if (!deferSnapshotDelete) return deleted;
		void deleted.catch(() => undefined);
		deferSnapshotDelete(deleted);
	} finally {
		state.evicting.delete(customerKey);
	}
}
