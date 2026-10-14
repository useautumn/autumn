export type SubjectSnapshotUpsert = {
	orgId: string;
	env: string;
	customerId: string;
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

export type SubjectSnapshotWrites = {
	upserts: readonly SubjectSnapshotUpsert[];
	deletes: readonly { orgId: string; env: string; customerId: string }[];
};
