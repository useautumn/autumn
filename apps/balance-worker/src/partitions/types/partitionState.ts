import type { OwnedPartitionHealth } from "../../health/ownedPartitionHealth.js";
import type {
	PartitionDirectory,
	PartitionRuntimePort,
	PartitionRuntimeResources,
	PartitionsDependencies,
	ResolvedPartitionsConfig,
	Unsubscribe,
} from "./partitions.js";

export interface PartitionsContext extends PartitionsDependencies {
	config: ResolvedPartitionsConfig;
}

export type PartitionsScope = {
	ctx: PartitionsContext;
	state: PartitionsState;
};

export interface AllocationScope extends PartitionsScope {
	allocationGeneration: number;
}

export type PartitionsState = {
	directory: PartitionDirectory;
	entries: Map<number, PartitionEntry>;
	/** Revoked but still serving until a successor is ready or the wait times out. */
	handingOff: Map<number, PartitionEntry>;
	retiringEntries: Map<number, PartitionEntry>;
	/** Withdrawn routes whose successor is not yet named; a request meeting one waits here. */
	handoffSettlements: Map<number, Promise<void>>;
	terminalHealthByPartition: Map<number, OwnedPartitionHealth>;
	partitionRetryTimers: Map<number, ReturnType<typeof setTimeout>>;
	status: "created" | "running" | "stopping" | "stopped";
	retirementFailed: boolean;
	generation: number;
	lifecycle: Promise<void>;
	stopPromise: Promise<void> | null;
	offsetsConnected: boolean;
	ownershipLinked: boolean;
	healthRefreshTimer: ReturnType<typeof setInterval> | null;
	healthRefreshPromise: Promise<void> | null;
	unsubscribePartitionChanges: Unsubscribe | null;
};

export type PartitionCleanupResult =
	| { ok: true }
	| { ok: false; cause: unknown };

export type PartitionEntry = PartitionRuntimeResources & {
	partition: number;
	startupSettled: boolean;
	startup: Promise<void> | null;
	/** Set before the claim is published, not after it is acknowledged. The record
	 *  is durable at the broker before the publish resolves, so a worker torn down
	 *  mid-claim would otherwise hold a claim it has no record of making and never
	 *  withdraw it. */
	claimAttempted: boolean;
	claimed: boolean;
	publicationFailed: boolean;
	unsubscribeUnavailable: Unsubscribe | null;
	/** Aborts whatever the entry waits for on the ownership log: a claim, a successor's ready. */
	handoffAbort: AbortController;
	/** True once the entry stopped serving; a handoff cannot be cancelled past this. */
	withdrawn: boolean;
	retirement: Promise<void> | null;
	drain: Promise<PartitionCleanupResult> | null;
};

export interface PartitionScope extends AllocationScope {
	entry: PartitionEntry;
}

export interface PartitionRetry extends AllocationScope {
	partition: number;
	entry?: PartitionEntry;
	cleanup: Promise<PartitionCleanupResult>;
}

export type AdmittedPartition = {
	routeEpoch: string;
	runtime: PartitionRuntimePort;
};

export type PartitionDirectoryState = Map<number, AdmittedPartition>;
