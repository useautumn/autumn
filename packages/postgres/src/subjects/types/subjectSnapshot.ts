/** One subject's row as a flush writes it; `stateJson` is the state already serialized, so it is encoded once. */
export type SubjectSnapshotUpsert = {
	orgId: string;
	env: string;
	customerId: string;
	/** Null for the customer's own subject. */
	entityId: string | null;
	internalCustomerId: string;
	internalEntityId: string | null;
	partition: number;
	partitionCount: number;
	stateVersion: number;
	stateJson: string;
	baselineAt: number;
	logOffset: bigint | null;
};

/** Every snapshot row of one customer: its own subject's and each of its entities'. */
export type SubjectSnapshotCustomer = {
	orgId: string;
	env: string;
	customerId: string;
};

/** What one flush does to `subject_snapshots`; a customer is in one list or the other, never both. */
export type SubjectSnapshotWrites = {
	upserts: readonly SubjectSnapshotUpsert[];
	/** A DELETE is always safe to land, so an evict's never waits on a claim: at worst it removes a fresh row. */
	deletes: readonly SubjectSnapshotCustomer[];
};
