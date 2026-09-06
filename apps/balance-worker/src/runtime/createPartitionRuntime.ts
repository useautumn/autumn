import type { OwnedPartitionHealth } from "../health/ownedPartitionHealth.js";
import { createPartitionProcessor } from "../processor/createPartitionProcessor.js";
import { getRuntimeHealth } from "./getRuntimeHealth.js";
import {
	activateRuntime,
	prepareRuntime,
	startRuntime,
} from "./lifecycle/startRuntime.js";
import {
	drainRuntime,
	stopRuntime,
	waitForRuntimeQuiescence,
} from "./lifecycle/stopRuntime.js";
import { type ProcessorRun, processCommand } from "./processCommand.js";
import type {
	PartitionOutcomeFollowerPort,
	PartitionRuntime,
	PartitionRuntimeConfig,
	PartitionRuntimeContext,
	PartitionRuntimeDependencies,
	RuntimeUnavailableListener,
} from "./types/partitionRuntime.js";
import type {
	PartitionRuntimeState,
	PartitionRuntimeStatus,
} from "./types/partitionRuntimeState.js";

export function createPartitionRuntime({
	ctx: dependencies,
	config,
}: {
	ctx: PartitionRuntimeDependencies;
	config: PartitionRuntimeConfig;
}): PartitionRuntime {
	validateRuntimeConfig(config);
	const state = createRuntimeState();
	const ctx: PartitionRuntimeContext = {
		...dependencies,
		config,
		processor: createPartitionProcessor({
			ctx: {
				stateStore: dependencies.stateStore,
				appender: dependencies.appender,
				trackReceiptPolicy: dependencies.trackReceiptPolicy,
			},
			config: {
				topic: config.topic,
				partition: config.partition,
				writerLimits: config.writerLimits,
			},
		}),
	};

	function start(): Promise<void> {
		return startRuntime({ ctx, state });
	}

	function prepare({
		follower,
	}: {
		follower: PartitionOutcomeFollowerPort;
	}): Promise<void> {
		return prepareRuntime({ ctx, state, follower });
	}

	function activate(): Promise<void> {
		return activateRuntime({ ctx, state });
	}

	function drain(): Promise<void> {
		return drainRuntime({ ctx, state });
	}

	function stop(): Promise<void> {
		return stopRuntime({ ctx, state });
	}

	function waitForQuiescence(): Promise<void> {
		return waitForRuntimeQuiescence({ ctx, state });
	}

	function process<Decision>(run: ProcessorRun<Decision>): Promise<Decision> {
		return processCommand({ ctx, state, run });
	}

	function getStatus(): PartitionRuntimeStatus {
		return state.status;
	}

	function getHealth(): OwnedPartitionHealth {
		return getRuntimeHealth({ ctx, state });
	}

	function subscribeUnavailable(
		listener: RuntimeUnavailableListener,
	): () => void {
		state.unavailableListeners.add(listener);
		function unsubscribe(): void {
			state.unavailableListeners.delete(listener);
		}
		return unsubscribe;
	}

	return {
		start,
		prepare,
		activate,
		drain,
		stop,
		waitForQuiescence,
		process,
		getStatus,
		getHealth,
		subscribeUnavailable,
	};
}

function validateRuntimeConfig(config: PartitionRuntimeConfig): void {
	if (config.topic.trim().length === 0)
		throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(config.partition) || config.partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${config.partition}`);
	}
	if (
		!Number.isSafeInteger(config.recoveryDrainTimeoutMs) ||
		config.recoveryDrainTimeoutMs <= 0
	) {
		throw new RangeError(
			"recoveryDrainTimeoutMs must be a positive safe integer",
		);
	}
}

function createRuntimeState(): PartitionRuntimeState {
	return {
		preparationFollower: null,
		preparationStopPromise: null,
		drainPromise: null,
		status: "created",
		terminalError: null,
		failureReason: null,
		producerConnectionAttempted: false,
		followerStartAttempted: false,
		startPromise: null,
		stopPromise: null,
		stopFollowerPromise: null,
		disconnectProducerPromise: null,
		recoveryPromise: null,
		startupAbortController: new AbortController(),
		unavailableListeners: new Set(),
	};
}
