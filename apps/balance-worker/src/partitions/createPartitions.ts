import {
	BALANCE_WORKER_CONSUMER_REJOIN_INITIAL_BACKOFF_MS,
	BALANCE_WORKER_CONSUMER_REJOIN_MAX_BACKOFF_MS,
	BALANCE_WORKER_HANDOFF_CLAIM_TIMEOUT_MS,
	BALANCE_WORKER_HANDOFF_DRAIN_CAP_MS,
	BALANCE_WORKER_HANDOFF_READY_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import type { OwnedPartitionHealth } from "../health/ownedPartitionHealth.js";
import { createRuntimeDirectory } from "./directory/createRuntimeDirectory.js";
import { listPartitionHealth } from "./health/partitionHealth.js";
import { consumerStatusOf } from "./lifecycle/rejoinConsumer.js";
import {
	startPartitionService,
	stopPartitionService,
} from "./partitionService.js";
import type { PartitionsState } from "./types/partitionState.js";
import type {
	PartitionConsumerStatus,
	PartitionSuccessor,
	Partitions,
	PartitionsConfig,
	PartitionsDependencies,
	PartitionTarget,
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
	const { findRuntime, findOwnedRuntime } = state.directory;

	function start(): Promise<void> {
		return startPartitionService({ ctx, state });
	}

	function stop(): Promise<void> {
		return stopPartitionService({ ctx, state });
	}

	function partitions(): OwnedPartitionHealth[] {
		return listPartitionHealth({ state });
	}

	function hasAssignment(): boolean {
		return state.status === "running" && state.generation > 0;
	}

	function isAdmitted(target: PartitionTarget): boolean {
		return state.directory.findOwnedRuntime(target) !== undefined;
	}

	function awaitHandoff({ partition }: PartitionTarget): Promise<void> {
		return state.handoffSettlements.get(partition) ?? Promise.resolve();
	}

	function findSuccessor({
		partition,
	}: PartitionTarget): PartitionSuccessor | undefined {
		const successor = state.handoffSuccessors.get(partition);
		return successor ? { ...successor } : undefined;
	}

	function consumer(): PartitionConsumerStatus {
		return consumerStatusOf({ state });
	}

	return {
		start,
		stop,
		partitions,
		hasAssignment,
		isAdmitted,
		findRuntime,
		findOwnedRuntime,
		awaitHandoff,
		findSuccessor,
		consumer,
	};
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
		handoffReadyTimeoutMs:
			config.handoffReadyTimeoutMs ?? BALANCE_WORKER_HANDOFF_READY_TIMEOUT_MS,
		handoffClaimTimeoutMs:
			config.handoffClaimTimeoutMs ?? BALANCE_WORKER_HANDOFF_CLAIM_TIMEOUT_MS,
		handoffDrainCapMs:
			config.handoffDrainCapMs ?? BALANCE_WORKER_HANDOFF_DRAIN_CAP_MS,
		consumerRejoin: config.consumerRejoin ?? {
			initialBackoffMs: BALANCE_WORKER_CONSUMER_REJOIN_INITIAL_BACKOFF_MS,
			maxBackoffMs: BALANCE_WORKER_CONSUMER_REJOIN_MAX_BACKOFF_MS,
		},
	};
	for (const name of [
		"healthRefreshIntervalMs",
		"partitionBootstrapRetryIntervalMs",
		"handoffReadyTimeoutMs",
		"handoffClaimTimeoutMs",
		"handoffDrainCapMs",
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
		handingOff: new Map(),
		retiringEntries: new Map(),
		handoffSettlements: new Map(),
		handoffSuccessors: new Map(),
		consumerRejoin: { attempts: 0, timer: null },
		terminalHealthByPartition: new Map(),
		partitionRetryTimers: new Map(),
		status: "created",
		retirementFailed: false,
		generation: 0,
		lifecycle: Promise.resolve(),
		stopPromise: null,
		offsetsConnected: false,
		ownershipLinked: false,
		healthRefreshTimer: null,
		healthRefreshPromise: null,
		unsubscribePartitionChanges: null,
	};
}
