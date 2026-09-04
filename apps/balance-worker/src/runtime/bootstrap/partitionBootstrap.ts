import {
	assertPartitionCheckpointOwnership,
	type PartitionCheckpointPartitionResolver,
	type PartitionCheckpointV1,
} from "../../checkpoint/partitionCheckpoint.js";
import {
	type PartitionCheckpointSource,
	PartitionCheckpointSourceError,
} from "../../checkpoint/partitionCheckpointSource.js";
import type {
	PartitionCheckpointRestoreLimits,
	PartitionCheckpointRestoreMode,
} from "../../state/checkpoint/restorePartitionCheckpoint.js";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import {
	assertPartitionLogRange,
	type PartitionBootstrapRefusalReason,
	type PartitionLogRange,
	planPartitionBootstrap,
} from "./partitionBootstrapPlan.js";

const maximumCheckpointSourceAttempts = 10;

export type PartitionBootstrapRetryPolicy = {
	maxAttempts: number;
	initialBackoffMs: number;
	maxBackoffMs: number;
};

export type PartitionBootstrapResult = {
	kind: "continued" | "initialized" | "replaced" | "restored";
	nextOffset: bigint;
};

export class PartitionBootstrapRefusedError extends Error {
	readonly retriable = false;
	readonly topic: string;
	readonly partition: number;
	readonly reason: PartitionBootstrapRefusalReason;

	constructor({
		topic,
		partition,
		reason,
	}: {
		topic: string;
		partition: number;
		reason: PartitionBootstrapRefusalReason;
	}) {
		super(`Partition bootstrap refused for ${topic}[${partition}]: ${reason}`);
		this.name = "PartitionBootstrapRefusedError";
		this.topic = topic;
		this.partition = partition;
		this.reason = reason;
	}
}

export type PartitionBootstrapSleeper = ({
	delayMs,
	signal,
}: {
	delayMs: number;
	signal: AbortSignal;
}) => Promise<void>;

type PartitionBootstrapStateStore = Pick<
	SqliteBalanceStateStore,
	"initializePartition" | "readNextOffset" | "restorePartitionCheckpoint"
>;

const assertRetryPolicy = ({
	maxAttempts,
	initialBackoffMs,
	maxBackoffMs,
}: PartitionBootstrapRetryPolicy): void => {
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
};

const throwIfAborted = ({ signal }: { signal: AbortSignal }): void => {
	if (signal.aborted) throw signal.reason;
};

const sleepWithSignal: PartitionBootstrapSleeper = ({ delayMs, signal }) =>
	new Promise<void>((resolve, reject) => {
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}
		const timeout = setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, delayMs);
		const abort = (): void => {
			clearTimeout(timeout);
			reject(signal.reason);
		};
		signal.addEventListener("abort", abort, { once: true });
	});

const loadCheckpoint = async ({
	source,
	topic,
	partition,
	signal,
	retryPolicy,
	sleep,
}: {
	source: PartitionCheckpointSource;
	topic: string;
	partition: number;
	signal: AbortSignal;
	retryPolicy: PartitionBootstrapRetryPolicy;
	sleep: PartitionBootstrapSleeper;
}): Promise<PartitionCheckpointV1 | null> => {
	let delayMs = retryPolicy.initialBackoffMs;
	for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
		throwIfAborted({ signal });
		try {
			const checkpoint = await source.latest({ topic, partition, signal });
			throwIfAborted({ signal });
			return checkpoint;
		} catch (cause) {
			throwIfAborted({ signal });
			const shouldRetry =
				cause instanceof PartitionCheckpointSourceError &&
				cause.retriable &&
				attempt < retryPolicy.maxAttempts;
			if (!shouldRetry) throw cause;
			await sleep({ delayMs, signal });
			delayMs = Math.min(delayMs * 2, retryPolicy.maxBackoffMs);
		}
	}
	throw new Error("Checkpoint source retry loop ended unexpectedly");
};

const restoreCheckpoint = ({
	stateStore,
	checkpoint,
	mode,
	restoreLimits,
	partitionResolver,
}: {
	stateStore: PartitionBootstrapStateStore;
	checkpoint: PartitionCheckpointV1;
	mode: PartitionCheckpointRestoreMode;
	restoreLimits: PartitionCheckpointRestoreLimits;
	partitionResolver: PartitionCheckpointPartitionResolver;
}): void => {
	stateStore.restorePartitionCheckpoint({
		checkpoint,
		mode,
		limits: restoreLimits,
		partitionResolver,
	});
};

export const createPartitionBootstrapper = ({
	stateStore,
	checkpointSource,
	partitionResolver,
	restoreLimits,
	retryPolicy,
	sleep = sleepWithSignal,
}: {
	stateStore: PartitionBootstrapStateStore;
	checkpointSource: PartitionCheckpointSource;
	partitionResolver: PartitionCheckpointPartitionResolver;
	restoreLimits: PartitionCheckpointRestoreLimits;
	retryPolicy: PartitionBootstrapRetryPolicy;
	sleep?: PartitionBootstrapSleeper;
}): {
	bootstrap({
		topic,
		partition,
		logRange,
		signal,
	}: {
		topic: string;
		partition: number;
		logRange: PartitionLogRange;
		signal: AbortSignal;
	}): Promise<PartitionBootstrapResult>;
} => {
	assertRetryPolicy(retryPolicy);

	const bootstrap = async ({
		topic,
		partition,
		logRange,
		signal,
	}: {
		topic: string;
		partition: number;
		logRange: PartitionLogRange;
		signal: AbortSignal;
	}): Promise<PartitionBootstrapResult> => {
		throwIfAborted({ signal });
		assertPartitionLogRange(logRange);
		const initialLocalNextOffset = stateStore.readNextOffset({
			topic,
			partition,
		});
		const needsCheckpoint =
			initialLocalNextOffset === null ||
			initialLocalNextOffset < logRange.logStartOffset;
		const loadedCheckpoint = needsCheckpoint
			? await loadCheckpoint({
					source: checkpointSource,
					topic,
					partition,
					signal,
					retryPolicy,
					sleep,
				})
			: null;
		throwIfAborted({ signal });
		const localNextOffset = needsCheckpoint
			? stateStore.readNextOffset({ topic, partition })
			: initialLocalNextOffset;
		const checkpoint =
			localNextOffset === null || localNextOffset < logRange.logStartOffset
				? loadedCheckpoint
				: null;
		if (checkpoint !== null) {
			assertPartitionCheckpointOwnership({
				checkpoint,
				topic,
				partition,
				partitionResolver,
			});
		}
		const plan = planPartitionBootstrap({
			localNextOffset,
			checkpoint,
			logRange,
		});
		throwIfAborted({ signal });

		switch (plan.kind) {
			case "continue":
				return { kind: "continued", nextOffset: plan.nextOffset };
			case "initialize":
				stateStore.initializePartition({
					topic,
					partition,
					nextOffset: plan.nextOffset,
				});
				return { kind: "initialized", nextOffset: plan.nextOffset };
			case "restore":
				restoreCheckpoint({
					stateStore,
					checkpoint: plan.checkpoint,
					mode: "restore",
					restoreLimits,
					partitionResolver,
				});
				return {
					kind: "restored",
					nextOffset: plan.checkpoint.nextOffset,
				};
			case "replace":
				restoreCheckpoint({
					stateStore,
					checkpoint: plan.checkpoint,
					mode: "replace",
					restoreLimits,
					partitionResolver,
				});
				return {
					kind: "replaced",
					nextOffset: plan.checkpoint.nextOffset,
				};
			case "refuse":
				throw new PartitionBootstrapRefusedError({
					topic,
					partition,
					reason: plan.reason,
				});
		}
	};

	return { bootstrap };
};
