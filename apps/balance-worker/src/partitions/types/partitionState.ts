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
	retiringEntries: Map<number, PartitionEntry>;
	terminalHealthByPartition: Map<number, OwnedPartitionHealth>;
	partitionRetryTimers: Map<number, ReturnType<typeof setTimeout>>;
	status: "created" | "running" | "stopping" | "stopped";
	retirementFailed: boolean;
	generation: number;
	lifecycle: Promise<void>;
	stopPromise: Promise<void> | null;
	offsetsConnected: boolean;
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
	claimed: boolean;
	publicationFailed: boolean;
	unsubscribeUnavailable: Unsubscribe | null;
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
