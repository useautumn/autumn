import type { OwnedPartitionHealth } from "../../health/ownedPartitionHealth.js";
export type PartitionFailure = { cause: unknown };
export type PartitionRuntime = {
	start(): Promise<void>;
	stop(): Promise<void>;
	waitForQuiescence(): Promise<void>;
	getHealth(): OwnedPartitionHealth;
};
export type PartitionResources = {
	runtime: PartitionRuntime;
	markUnavailable(failure: PartitionFailure): void;
};
export type PartitionRevocation = {
	causeForPartition(position: { partition: number }): unknown;
};
export interface PartitionAllocation extends PartitionRevocation {
	partitions: number[];
}
export type PartitionChangeListeners = {
	onAssigned(allocation: PartitionAllocation): void;
	onRevoked(revocation: PartitionRevocation): void;
	onCrashed(failure: PartitionFailure): void;
	onError(failure: PartitionFailure): void;
};
export type PartitionsDependencies = {
	consumer: {
		start(): Promise<void>;
		stop(): Promise<void>;
		pause(position: { topic: string; partitions: number[] }): void;
	};
	partitionOffsets: {
		connect(): Promise<void>;
		disconnect(): Promise<void>;
		fetchHighWatermarks(position: { topic: string }): Promise<{
			readHighWatermark(position: { partition: number }): bigint;
		}>;
	};
	progress: {
		readProgress(position: {
			topic: string;
			partition: number;
		}): PartitionProgress;
		observeHighWatermark(position: {
			topic: string;
			partition: number;
			highWatermark: bigint;
		}): void;
	};
	subscribePartitionChanges(listeners: PartitionChangeListeners): () => void;
	createRuntime(position: {
		topic: string;
		partition: number;
	}): PartitionResources;
	onError(failure: PartitionFailure): void;
	onUnhealthyPartition(failure: {
		topic: string;
		partition: number;
		cause: unknown;
	}): void;
};
export type PartitionProgress = Pick<
	OwnedPartitionHealth,
	"localNextOffset" | "consumedNextOffset" | "highWatermark"
>;
export type PartitionsConfig = {
	topic: string;
	healthRefreshIntervalMs: number;
	partitionBootstrapRetryIntervalMs?: number;
};
export interface ResolvedPartitionsConfig extends PartitionsConfig {
	partitionBootstrapRetryIntervalMs: number;
}
export type Partitions = {
	start(): Promise<void>;
	stop(): Promise<void>;
	partitions(): OwnedPartitionHealth[];
};
