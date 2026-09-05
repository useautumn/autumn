import type { OwnedPartitionHealth } from "../../health/ownedPartitionHealth.js";
import type {
	PartitionResources,
	PartitionsDependencies,
	ResolvedPartitionsConfig,
} from "./partitions.js";
export interface PartitionsContext extends PartitionsDependencies {
	config: ResolvedPartitionsConfig;
}
export type PartitionEntry = PartitionResources & {
	partition: number;
	startupSettled: boolean;
};
export type PartitionsState = {
	entries: Map<number, PartitionEntry>;
	retiringEntries: Map<number, PartitionEntry>;
	terminalHealthByPartition: Map<number, OwnedPartitionHealth>;
	partitionRetryTimers: Map<number, ReturnType<typeof setTimeout>>;
	healthRefreshTimer: ReturnType<typeof setInterval> | null;
	healthRefreshPromise: Promise<void> | null;
	status: "created" | "running" | "stopping" | "stopped";
	generation: number;
	retirementFailed: boolean;
	lifecycle: Promise<void>;
	stopPromise: Promise<void> | null;
	offsetsConnected: boolean;
	unsubscribePartitionChanges: (() => void) | null;
};
export type PartitionsScope = {
	ctx: PartitionsContext;
	state: PartitionsState;
};
export interface AllocationScope extends PartitionsScope {
	allocationGeneration: number;
}
export type PartitionCleanupResult =
	| { ok: true }
	| { ok: false; cause: unknown };
export interface PartitionRetry extends AllocationScope {
	partition: number;
	entry?: PartitionEntry;
	cleanup: Promise<PartitionCleanupResult>;
}
