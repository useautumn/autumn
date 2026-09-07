import type { OwnedPartitionHealth } from "../health/ownedPartitionHealth.js";
import { createRuntimeDirectory } from "./directory/createRuntimeDirectory.js";
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
	ResolvedPartitionsConfig,
} from "./types/partitions.js";

export function createPartitions({
	ctx: dependencies,
	config,
}: {
	ctx: PartitionsDependencies;
	config: PartitionsConfig;
}): Partitions {
	const ctx = { ...dependencies, config: resolvePartitionConfig(config) };
	const state = createPartitionState();
	const { findRuntime } = state.directory;

	function start(): Promise<void> {
		return startPartitionService({ ctx, state });
	}

	function stop(): Promise<void> {
		return stopPartitionService({ ctx, state });
	}

	function partitions(): OwnedPartitionHealth[] {
		return listPartitionHealth({ state });
	}

	return { start, stop, partitions, findRuntime };
}

function resolvePartitionConfig(
	config: PartitionsConfig,
): ResolvedPartitionsConfig {
	if (config.topic.trim().length === 0)
		throw new Error("Kafka topic cannot be empty");
	const options = {
		...config,
		partitionBootstrapRetryIntervalMs:
			config.partitionBootstrapRetryIntervalMs ?? 30_000,
	};
	for (const name of [
		"healthRefreshIntervalMs",
		"partitionBootstrapRetryIntervalMs",
	] as const) {
		if (!Number.isSafeInteger(options[name]) || options[name] <= 0) {
			throw new RangeError(`${name} must be a positive safe integer`);
		}
	}
	return options;
}

function createPartitionState(): PartitionsState {
	return {
		directory: createRuntimeDirectory(),
		entries: new Map(),
		retiringEntries: new Map(),
		terminalHealthByPartition: new Map(),
		partitionRetryTimers: new Map(),
		status: "created",
		retirementFailed: false,
		generation: 0,
		lifecycle: Promise.resolve(),
		stopPromise: null,
		offsetsConnected: false,
		healthRefreshTimer: null,
		healthRefreshPromise: null,
		unsubscribePartitionChanges: null,
	};
}
