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

/** What one flush does to `subject_snapshots`; a customer is in one list or the other, never both. */
export type SubjectSnapshotWrites = {
	upserts: readonly SubjectSnapshotUpsert[];
	/** The customer part of the worker's MeteringIdentity: every row of the customer goes, its entities' included. */
	deletes: readonly { orgId: string; env: string; customerId: string }[];
};

/** One subject's row as a cold load reads it, at the version it asked for; `state` is the jsonb as stored, parsed by the reader. */
export type SubjectSnapshotRow = {
	orgId: string;
	env: string;
	customerId: string;
	/** Null for the customer's own subject. */
	entityId: string | null;
	state: unknown;
	baselineAt: number;
};
