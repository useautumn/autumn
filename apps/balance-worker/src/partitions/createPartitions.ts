import {
	startPartitionService,
	stopPartitionService,
} from "./partitionService.js";
import type { PartitionsState } from "./types/partitionState.js";
import type {
	Partitions,
	PartitionsConfig,
	PartitionsDependencies,
} from "./types/partitions.js";

export function createPartitions({
	ctx: dependencies,
	config,
}: {
	ctx: PartitionsDependencies;
	config: PartitionsConfig;
}): Partitions {
	if (!config.topic.trim()) throw new Error("Kafka topic cannot be empty");
	const ctx = { ...dependencies, config };
	const state: PartitionsState = {
		entries: new Map(),
		status: "created",
		generation: 0,
		retirementFailed: false,
		lifecycle: Promise.resolve(),
		stopPromise: null,
		offsetsConnected: false,
		unsubscribePartitionChanges: null,
	};
	function start(): Promise<void> {
		return startPartitionService({ ctx, state });
	}
	function stop(): Promise<void> {
		return stopPartitionService({ ctx, state });
	}
	return { start, stop };
}
