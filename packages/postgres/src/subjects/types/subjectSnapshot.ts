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

/** The partition claim a drop was asked under; its rows go only while that claim still holds the partition. */
export type SubjectSnapshotClaim = {
	topic: string;
	partition: number;
	claimToken: string;
};

/** A customer whose rows a flush removes; unclaimed when the flush's own bookmark already proves ownership. */
export type SubjectSnapshotDelete = SubjectSnapshotCustomer & {
	claim?: SubjectSnapshotClaim;
};

/** What one flush does to `subject_snapshots`; a customer is in one list or the other, never both. */
export type SubjectSnapshotWrites = {
	upserts: readonly SubjectSnapshotUpsert[];
	deletes: readonly SubjectSnapshotDelete[];
};
