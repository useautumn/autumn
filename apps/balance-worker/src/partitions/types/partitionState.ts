import type {
	PartitionResources,
	PartitionsConfig,
	PartitionsDependencies,
} from "./partitions.js";
export interface PartitionsContext extends PartitionsDependencies {
	config: PartitionsConfig;
}
export type PartitionEntry = PartitionResources & { partition: number };
export type PartitionsState = {
	entries: Map<number, PartitionEntry>;
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
