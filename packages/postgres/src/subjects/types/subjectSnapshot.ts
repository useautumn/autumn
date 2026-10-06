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
	/** The last log offset the state includes: a flush's last record, or the bookmark a refresh read under, less one. */
	logOffset: bigint | null;
	/** The row's state no longer holds: it is kept but hidden (written_at 0), and `stateJson` is not written. */
	stale?: boolean;
};

/** What one flush does to `subject_snapshots`; a customer is in one list or the other, never both. */
export type SubjectSnapshotWrites = {
	upserts: readonly SubjectSnapshotUpsert[];
	/** The customer part of the worker's MeteringIdentity: every row of the customer goes, its entities' included. */
	deletes: readonly { orgId: string; env: string; customerId: string }[];
};
