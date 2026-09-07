export type PartitionCheckpointSchedulerConfig = {
	intervalMs: number;
	jitterRatio: number;
	pollIntervalMs: number;
	exportTimeoutMs: number;
	maxAttempts: number;
	initialBackoffMs: number;
	maxBackoffMs: number;
	cleanupIntervalMs: number;
	cleanupBudgetMs: number;
	cleanupBatchSize: number;
	maxCleanupChunksPerTurn: number;
};

export const defaultPartitionCheckpointSchedulerConfig: Readonly<PartitionCheckpointSchedulerConfig> =
	Object.freeze({
		intervalMs: 60_000,
		jitterRatio: 0.2,
		pollIntervalMs: 1_000,
		exportTimeoutMs: 30_000,
		maxAttempts: 3,
		initialBackoffMs: 1_000,
		maxBackoffMs: 5_000,
		cleanupIntervalMs: 1_000,
		cleanupBudgetMs: 5,
		cleanupBatchSize: 1_000,
		maxCleanupChunksPerTurn: 64,
	});

export const assertPartitionCheckpointSchedulerConfig = ({
	config,
}: {
	config: PartitionCheckpointSchedulerConfig;
}): void => {
	for (const [name, value] of Object.entries(config)) {
		if (name === "jitterRatio") {
			if (!Number.isFinite(value) || value < 0 || value > 1)
				throw new RangeError("jitterRatio must be between zero and one");
		} else if (!Number.isSafeInteger(value) || value <= 0) {
			throw new RangeError(`${name} must be a positive safe integer`);
		}
	}
	if (config.maxAttempts > 10)
		throw new RangeError("maxAttempts cannot exceed ten");
	if (config.maxBackoffMs < config.initialBackoffMs)
		throw new RangeError("maxBackoffMs cannot be below initialBackoffMs");
};

export type PartitionCheckpointSchedulerClock = {
	now(): number;
	monotonicNow(): number;
	random(): number;
	schedule({ delayMs, run }: { delayMs: number; run(): void }): () => void;
	yield(): Promise<void>;
};

export const partitionCheckpointSchedulerClock: PartitionCheckpointSchedulerClock =
	{
		now: Date.now,
		monotonicNow: () => performance.now(),
		random: Math.random,
		schedule: ({ delayMs, run }) => {
			const timer = setTimeout(run, delayMs);
			timer.unref();
			return () => clearTimeout(timer);
		},
		yield: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
	};

export const checkpointIntervalOf = ({
	config,
	random,
}: {
	config: PartitionCheckpointSchedulerConfig;
	random: number;
}): number => {
	if (!Number.isFinite(random) || random < 0 || random > 1)
		throw new RangeError(
			"Checkpoint jitter sample must be between zero and one",
		);
	return Math.max(
		1,
		Math.round(config.intervalMs * (1 + config.jitterRatio * (2 * random - 1))),
	);
};
