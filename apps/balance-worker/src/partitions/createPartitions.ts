import { listPartitionHealth } from "./health/partitionHealth.js";
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
	if (
		!Number.isSafeInteger(config.healthRefreshIntervalMs) ||
		config.healthRefreshIntervalMs <= 0
	)
		throw new RangeError(
			"healthRefreshIntervalMs must be a positive safe integer",
		);
	const partitionBootstrapRetryIntervalMs =
		config.partitionBootstrapRetryIntervalMs ?? 30_000;
	if (
		!Number.isSafeInteger(partitionBootstrapRetryIntervalMs) ||
		partitionBootstrapRetryIntervalMs <= 0
	)
		throw new RangeError(
			"partitionBootstrapRetryIntervalMs must be a positive safe integer",
		);
	const ctx = {
		...dependencies,
		config: { ...config, partitionBootstrapRetryIntervalMs },
	};
	const state: PartitionsState = {
		entries: new Map(),
		retiringEntries: new Map(),
		terminalHealthByPartition: new Map(),
		partitionRetryTimers: new Map(),
		healthRefreshTimer: null,
		healthRefreshPromise: null,
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
	function partitions() {
		return listPartitionHealth({ state });
	}
	return { start, stop, partitions };
}
