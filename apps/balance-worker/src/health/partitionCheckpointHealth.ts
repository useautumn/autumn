export type PartitionCheckpointFailure = {
	name: string;
	message: string;
	retriable: boolean;
	limitName?: string;
	limit?: number;
	observed?: number;
};

export type PartitionCheckpointHealth = {
	status: "waiting" | "up_to_date" | "exporting" | "degraded" | "stopped";
	lastConfirmedNextOffset: bigint | null;
	lastPublishedAt: number | null;
	lastAttemptAt: number | null;
	lastDurationMs: number | null;
	lastSerializedBytes: number | null;
	dirtySince: number | null;
	uncheckpointedAgeMs: number;
	failure: PartitionCheckpointFailure | null;
	cleanup: {
		lastPrunedAt: number | null;
		deletedReceipts: number;
		lastDurationMs: number | null;
		backlog: "unknown" | "possible" | "clear";
		failure: PartitionCheckpointFailure | null;
	};
};
