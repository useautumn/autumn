import type { OwnedPartitionHealth } from "../../health/ownedPartitionHealth.js";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";

export interface PartitionRuntimePort {
	/** Read-only: rebuilds the dedup window from the log, writes nothing durable. */
	prepare(): Promise<void>;
	/** Fences and catches up from the bookmark; only after the predecessor has drained. */
	activate(): Promise<void>;
	stop(): Promise<void>;
	drain(): Promise<void>;
	waitForQuiescence(): Promise<void>;
	getHealth(): OwnedPartitionHealth;
	subscribeUnavailable(listener: PartitionUnavailableListener): Unsubscribe;
	process<Decision>(
		run: (processor: PartitionProcessor) => Promise<Decision>,
	): Promise<Decision>;
}

export type Unsubscribe = () => void;

export type PartitionFailure = { cause: unknown };

/** A consumer crash; without `restart` the consumer never rejoins, so the worker would own nothing forever. */
export type PartitionConsumerCrash = PartitionFailure & { restart: boolean };

export type PartitionUnavailableListener = (failure: PartitionFailure) => void;

export type PartitionOwnershipPublication = {
	/** Names `endpoint` as the owner, this worker when omitted. */
	claim(params?: { endpoint: string }): Promise<{ routeEpoch: string }>;
	release(): Promise<void>;
	announceReady(): Promise<void>;
	/** Resolves with the successor's endpoint on its `ready`, rejects with the signal's reason. */
	awaitReady(params: { signal: AbortSignal }): Promise<{ endpoint: string }>;
	/** Resolves with the route epoch of a `claimed` naming this worker, rejects with the signal's reason. */
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
	/** What this worker reports as its own when the group rebalances: claimed when a partition's runtime is built, released once it has stopped. */
	served?: {
		claim(entry: { partition: number }): void;
		release(entry: { partition: number }): void;
	};
	/** The ownership tail and the plain producer behind `announceReady`; started before the group is joined. */
	ownershipLink?: { start(): Promise<void>; stop(): Promise<void> };
	/** When a prepared partition may announce `ready`; unset means as soon as it is prepared. */
	awaitReadyAnnouncement?(params: {
		partition: number;
		signal: AbortSignal;
	}): Promise<void>;
	onError(failure: PartitionFailure): void;
	onUnhealthyPartition(failure: {
		topic: string;
		partition: number;
		cause: unknown;
	}): void;
	/** The service shut itself down after a partition failed terminally, so this
	 *  worker owns nothing and will not pick anything up again. Nothing restarts a
	 *  stopped consumer, so without someone acting on this the task stays alive
	 *  and idle and the scheduler never learns to replace it. Left optional so a
	 *  test can observe the stop without taking the runner down with it. */
	onServiceStopped?(): void;
};

export type PartitionsConfig = {
	topic: string;
	/** Held paused from assignment until the partition is admitted, so no command meets a runtime that is not ready. */
	commandTopic?: string;
	healthRefreshIntervalMs: number;
	partitionBootstrapRetryIntervalMs?: number;
	/** How long a revoked partition keeps serving while it waits for a successor's `ready`. */
	handoffReadyTimeoutMs?: number;
	/** How long a prepared partition waits to be named owner before it claims for itself. */
	handoffClaimTimeoutMs?: number;
};

export interface ResolvedPartitionsConfig extends PartitionsConfig {
	partitionBootstrapRetryIntervalMs: number;
	handoffReadyTimeoutMs: number;
	handoffClaimTimeoutMs: number;
}

export type Partitions = {
	start(): Promise<void>;
	stop(): Promise<void>;
	partitions(): OwnedPartitionHealth[];
	findRuntime(route: PartitionRoute): PartitionRuntimePort | undefined;
	/** Settles once a partition mid-handoff has named its successor, so a caller can refresh its route once. */
	awaitHandoff(target: PartitionTarget): Promise<void>;
	/** For the partition's own queued commands: no route epoch, since no server chose the route. */
	findOwnedRuntime(target: PartitionTarget): PartitionRuntimePort | undefined;
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
	findOwnedRuntime(target: PartitionTarget): PartitionRuntimePort | undefined;
}
