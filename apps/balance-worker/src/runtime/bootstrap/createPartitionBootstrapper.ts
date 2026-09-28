import { bootstrapPartition } from "./bootstrapPartition.js";
import { sleepWithSignal } from "./read/loadPartitionCheckpoint.js";
import type {
	PartitionBootstrapContext,
	PartitionBootstrapInput,
	PartitionBootstrapOptions,
	PartitionBootstrapper,
	PartitionBootstrapResult,
	PartitionBootstrapRetryPolicy,
} from "./types/partitionBootstrap.js";

const maximumCheckpointSourceAttempts = 10;

function assertRetryPolicy({
	maxAttempts,
	initialBackoffMs,
	maxBackoffMs,
}: PartitionBootstrapRetryPolicy): void {
	if (
		!Number.isSafeInteger(maxAttempts) ||
		maxAttempts <= 0 ||
		maxAttempts > maximumCheckpointSourceAttempts
	) {
		throw new RangeError(
			`maxAttempts must be between 1 and ${maximumCheckpointSourceAttempts}`,
		);
	}
	if (!Number.isSafeInteger(initialBackoffMs) || initialBackoffMs <= 0) {
		throw new RangeError("initialBackoffMs must be a positive safe integer");
	}
	if (!Number.isSafeInteger(maxBackoffMs) || maxBackoffMs <= 0) {
		throw new RangeError("maxBackoffMs must be a positive safe integer");
	}
	if (initialBackoffMs > maxBackoffMs) {
		throw new RangeError("initialBackoffMs cannot exceed maxBackoffMs");
	}
}

export function createPartitionBootstrapper({
	stateStore,
	checkpointSource,
	partitionResolver,
	restoreLimits,
	retryPolicy,
	sleep = sleepWithSignal,
}: PartitionBootstrapOptions): PartitionBootstrapper {
	assertRetryPolicy(retryPolicy);
	const ctx: PartitionBootstrapContext = {
		stateStore,
		checkpointSource,
		partitionResolver,
		restoreLimits,
		retryPolicy,
		sleep,
	};
	function bootstrap(
		params: PartitionBootstrapInput,
	): Promise<PartitionBootstrapResult> {
		return bootstrapPartition({ ctx, ...params });
	}

	return { bootstrap };
}
