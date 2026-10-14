import type { AutumnLogger } from "@autumn/logging";
import type { OwnedPartitionHealth } from "../../health/ownedPartitionHealth.js";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";

export interface PartitionRuntimePort {
	prepare(): Promise<void>;
	activate(): Promise<void>;
	fence?(): Promise<void>;
	stop(): Promise<void>;
	drain(): Promise<void>;
	waitForQuiescence(): Promise<void>;
	getHealth(): OwnedPartitionHealth;
	subscribeUnavailable(listener: PartitionUnavailableListener): Unsubscribe;
	process<Decision>(
		run: (processor: PartitionProcessor) => Promise<Decision>,
	): Promise<Decision>;
	processInline?<Decision>(
		run: (processor: PartitionProcessor) => Decision | null,
	): Decision | null;
}

export type Unsubscribe = () => void;

export type PartitionFailure = { cause: unknown };

export type PartitionConsumerCrash = PartitionFailure & { restart: boolean };

export type PartitionUnavailableListener = (failure: PartitionFailure) => void;

export type PartitionOwnershipPublication = {
	claim(params?: { endpoint: string }): Promise<{ routeEpoch: string }>;
	release(): Promise<void>;
	announceReady(): Promise<void>;
	announcePreparing(): Promise<void>;
	announceDraining(params: { successor: string }): Promise<void>;
	awaitReady(params: { signal: AbortSignal }): Promise<{ endpoint: string }>;
	readActiveDrain(): { endpoint: string } | null;
	readActivePreparation(): { endpoint: string } | null;
	awaitPreparing(params: {
		signal: AbortSignal;
	}): Promise<{ endpoint: string }>;
	awaitDraining(params: { signal: AbortSignal }): Promise<{ endpoint: string }>;
	awaitForeignClaim(params: {
		signal: AbortSignal;
	}): Promise<{ endpoint: string }>;
	awaitClaim(params: { signal: AbortSignal }): Promise<{ routeEpoch: string }>;
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
	onCrashed(crash: PartitionConsumerCrash): void;
	onError(failure: PartitionFailure): void;
};

export type SubscribePartitionChanges = (
	listeners: PartitionChangeListeners,
) => Unsubscribe;

export type PartitionConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	restart?(): Promise<void>;
	pause(position: { topic: string; partitions: number[] }): void;
	resume(position: {
		topic: string;
		partitions: number[];
	}): void | Promise<void>;
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
	served?: {
		claim(entry: { partition: number }): void;
		release(entry: { partition: number }): void;
		assign(entry: { partitions: readonly number[] }): void;
		relinquish(entry: { partition: number }): void;
	};
	ownershipLink?: { start(): Promise<void>; stop(): Promise<void> };
	awaitReadyAnnouncement?(params: {
		partition: number;
		signal: AbortSignal;
	}): Promise<void>;
	acquirePreparation?(params: { signal: AbortSignal }): Promise<() => void>;
	onError(failure: PartitionFailure): void;
	onUnhealthyPartition(failure: {
		topic: string;
		partition: number;
		cause: unknown;
	}): void;
	onServiceStopped?(reason: PartitionServiceStopReason): void;
	logger?: Pick<AutumnLogger, "info" | "warn">;
};

export type PartitionServiceStopReason = {
	cause: unknown;
	scope:
		| "consumer"
		| "partition"
		| "retirement"
		| "http-workers"
		| "producer-thread";
};

export type PartitionConsumerStatus = {
	status: "joined" | "rejoining";
	rejoinAttempts: number;
};

export type PartitionsConfig = {
	topic: string;
	commandTopic?: string;
	healthRefreshIntervalMs: number;
	partitionBootstrapRetryIntervalMs?: number;
	handoffReadyTimeoutMs?: number;
	handoffClaimTimeoutMs?: number;
	handoffDrainCapMs?: number;
	consumerRejoin?: { initialBackoffMs: number; maxBackoffMs: number };
};

export interface ResolvedPartitionsConfig extends PartitionsConfig {
	partitionBootstrapRetryIntervalMs: number;
	handoffReadyTimeoutMs: number;
	handoffClaimTimeoutMs: number;
	handoffDrainCapMs: number;
	consumerRejoin: { initialBackoffMs: number; maxBackoffMs: number };
}

export type Partitions = {
	start(): Promise<void>;
	stop(): Promise<void>;
	partitions(): OwnedPartitionHealth[];
	hasAssignment(): boolean;
	isAdmitted(target: PartitionTarget): boolean;
	findRuntime(route: PartitionRoute): PartitionRuntimePort | undefined;
	awaitHandoff(target: PartitionTarget): Promise<void>;
	findOwnedRuntime(target: PartitionTarget): PartitionRuntimePort | undefined;
	findSuccessor(target: PartitionTarget): PartitionSuccessor | undefined;
	consumer(): PartitionConsumerStatus;
};

export type PartitionTarget = { partition: number };

export type PartitionSuccessor = {
	partition: number;
	endpoint: string;
	routeEpoch: string;
};

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
	findOwnedRuntime(target: PartitionTarget): PartitionRuntimePort | undefined;
}
