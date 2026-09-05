import type {
	CheckCommand,
	CheckDecision,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import type { OwnedPartitionHealth } from "../../health/ownedPartitionHealth.js";

export interface PartitionRuntimePort {
	start(): Promise<void>;
	stop(): Promise<void>;
	drain(): Promise<void>;
	waitForQuiescence(): Promise<void>;
	getHealth(): OwnedPartitionHealth;
	subscribeUnavailable(listener: PartitionUnavailableListener): Unsubscribe;
	submitTrack(params: { command: TrackCommand }): Promise<TrackDecision>;
	check(params: { command: CheckCommand }): Promise<CheckDecision>;
}

export type Unsubscribe = () => void;

export type PartitionFailure = { cause: unknown };

export type PartitionUnavailableListener = (failure: PartitionFailure) => void;

export type PartitionOwnershipPublication = {
	claim(): Promise<{ routeEpoch: string }>;
	release(): Promise<void>;
};

export type PartitionRuntimeResources = {
	runtime: PartitionRuntimePort;
	publication: PartitionOwnershipPublication;
	markUnavailable(failure: PartitionFailure): void;
};

export type PartitionRuntimeFactory = (position: {
	topic: string;
	partition: number;
}) => PartitionRuntimeResources;

export type PartitionRevocation = {
	causeForPartition(position: { partition: number }): unknown;
};

export interface PartitionAssignment extends PartitionRevocation {
	partitions: number[];
}

export type PartitionChangeListeners = {
	onAssigned(change: PartitionAssignment): void;
	onRevoked(change: PartitionRevocation): void;
	onCrashed(failure: PartitionFailure): void;
	onError(failure: PartitionFailure): void;
};

export type SubscribePartitionChanges = (
	listeners: PartitionChangeListeners,
) => Unsubscribe;

export type PartitionConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	pause(position: { topic: string; partitions: number[] }): void;
};

export type PartitionOffsets = {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	fetchHighWatermarks(position: { topic: string }): Promise<{
		readHighWatermark(position: { partition: number }): bigint;
	}>;
};

export type PartitionProgress = {
	localNextOffset: bigint | null;
	consumedNextOffset: bigint | null;
	highWatermark: bigint | null;
};

export type PartitionProgressTracker = {
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

export type PartitionsDependencies = {
	consumer: PartitionConsumer;
	partitionOffsets: PartitionOffsets;
	progress: PartitionProgressTracker;
	subscribePartitionChanges: SubscribePartitionChanges;
	createRuntime: PartitionRuntimeFactory;
	onError(failure: PartitionFailure): void;
	onUnhealthyPartition(failure: {
		topic: string;
		partition: number;
		cause: unknown;
	}): void;
};

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
	findRuntime(route: PartitionRoute): PartitionRuntimePort | undefined;
};

export type PartitionTarget = { partition: number };

export type PartitionRoute = {
	partition: number;
	routeEpoch: string;
};

export type PartitionAdmission = {
	partition: number;
	routeEpoch: string;
	runtime: PartitionRuntimePort;
};

export interface PartitionDirectory {
	admit(admission: PartitionAdmission): void;
	withdraw(target: PartitionTarget): void;
	findRuntime(route: PartitionRoute): PartitionRuntimePort | undefined;
}
