import type { PartitionCheckpointHealth } from "../../health/partitionCheckpointHealth.js";

export type PartitionCheckpointLease = {
	getHealth(): PartitionCheckpointHealth;
};

export type PartitionCheckpointMaintenance = {
	start({
		topic,
		partition,
		signal,
		readConsumedNextOffset,
		onStateFailure,
	}: {
		topic: string;
		partition: number;
		signal: AbortSignal;
		readConsumedNextOffset(): bigint | null;
		onStateFailure({ cause }: { cause: unknown }): void;
	}): PartitionCheckpointLease;
};
