export type PartitionFailure = { cause: unknown };
export type PartitionRuntime = {
	start(): Promise<void>;
	stop(): Promise<void>;
	waitForQuiescence(): Promise<void>;
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
	partitionOffsets: { connect(): Promise<void>; disconnect(): Promise<void> };
	subscribePartitionChanges(listeners: PartitionChangeListeners): () => void;
	createRuntime(position: {
		topic: string;
		partition: number;
	}): PartitionResources;
	onError(failure: PartitionFailure): void;
};
export type PartitionsConfig = { topic: string };
export type Partitions = { start(): Promise<void>; stop(): Promise<void> };
