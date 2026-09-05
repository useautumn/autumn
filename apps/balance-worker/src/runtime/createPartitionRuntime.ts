import type {
	CheckCommand,
	CheckDecision,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import { createPartitionTrackWriter } from "../writer/partitionTrackWriter.js";
import {
	checkRuntimeBalance,
	submitRuntimeTrack,
} from "./commands/balanceCommands.js";
import { createRequestTracker } from "./createRequestTracker.js";
import { startRuntime } from "./lifecycle/startRuntime.js";
import {
	drainRuntime,
	stopRuntime,
	waitForRuntimeQuiescence,
} from "./lifecycle/stopRuntime.js";
import type {
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
	const ctx: PartitionRuntimeContext = {
		...dependencies,
		config,
		writer: createPartitionTrackWriter({
			topic: config.topic,
			partition: config.partition,
			stateStore: dependencies.stateStore,
			appender: dependencies.appender,
			limits: config.writerLimits,
		}),
		requestTracker: createRequestTracker(),
	};
	const state = createRuntimeState();

	function start(): Promise<void> {
		return startRuntime({ ctx, state });
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

	function submitTrack({
		command,
	}: {
		command: TrackCommand;
	}): Promise<TrackDecision> {
		return submitRuntimeTrack({ ctx, state, command });
	}

	function check({
		command,
	}: {
		command: CheckCommand;
	}): Promise<CheckDecision> {
		return checkRuntimeBalance({ ctx, state, command });
	}

	function getStatus(): PartitionRuntimeStatus {
		return state.status;
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
		drain,
		stop,
		waitForQuiescence,
		submitTrack,
		check,
		getStatus,
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
		drainPromise: null,
		status: "created",
		terminalError: null,
		producerConnectionAttempted: false,
		followerStartAttempted: false,
		startPromise: null,
		stopPromise: null,
		stopFollowerPromise: null,
		disconnectProducerPromise: null,
		recoveryPromise: null,
		unavailableListeners: new Set(),
	};
}
