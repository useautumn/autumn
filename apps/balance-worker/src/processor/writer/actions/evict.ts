import type { SubjectSnapshotCustomer } from "@autumn/postgres";
import type { PartitionWriterScope } from "../types/partitionWriter.js";

/** Drops the customer's resident rows; a subject pinned by an in-flight commit goes when that commit releases it. */
export async function evict({
	scope,
	customerKey,
	deferSnapshotDrop,
}: {
	scope: PartitionWriterScope;
	customerKey: string;
	deferSnapshotDrop?: (dropped: Promise<void>) => void;
}): Promise<void> {
	const { state, config } = scope;
	const snapshots =
		scope.ctx.subjectSnapshots?.get().mode === "write"
			? scope.ctx.stateStore.subjectSnapshots
			: undefined;
	// Set before any await: a mutation decided on these rows from here on must not snapshot them.
	state.evicting.add(customerKey);
	try {
		// The next command re-reads Postgres, so the worker's own writes must be there first.
		await state.storeCompletion;
		state.subjects.evictCustomer({ customerKey });
		if (!snapshots) return;
		// Handed to the partition's lane now, so it lands after every record decided before this evict.
		const dropped = snapshots.dropCustomer({
			topic: config.topic,
			partition: config.partition,
			customer: customerOfKey({ customerKey }),
		});
		if (!deferSnapshotDrop) return dropped;
		void dropped.catch(() => undefined);
		deferSnapshotDrop(dropped);
	} finally {
		state.evicting.delete(customerKey);
	}
}

/** The customer key is `meteringIdentityToPartitionKey`'s JSON triple, so this reads back exactly what it was built from. */
function customerOfKey({
	customerKey,
}: {
	customerKey: string;
}): SubjectSnapshotCustomer {
	const parsed: unknown = JSON.parse(customerKey);
	if (
		!Array.isArray(parsed) ||
		parsed.length !== 3 ||
		!parsed.every((part) => typeof part === "string")
	)
		throw new TypeError(`Not a customer key: ${customerKey}`);
	const [orgId, env, customerId] = parsed as [string, string, string];
	return { orgId, env, customerId };
}
