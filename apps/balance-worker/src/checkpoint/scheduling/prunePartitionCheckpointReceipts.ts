import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import {
	checkpointFailureOf,
	type PartitionCheckpointEntry,
} from "./partitionCheckpointEntry.js";
import type {
	PartitionCheckpointSchedulerClock,
	PartitionCheckpointSchedulerConfig,
} from "./partitionCheckpointSchedulerConfig.js";

export const prunePartitionCheckpointReceipts = async ({
	entries,
	stateStore,
	clock,
	config,
	isCurrent,
	onStateFailure,
}: {
	entries: readonly PartitionCheckpointEntry[];
	stateStore: Pick<SqliteBalanceStateStore, "pruneExpiredTrackReceipts">;
	clock: PartitionCheckpointSchedulerClock;
	config: PartitionCheckpointSchedulerConfig;
	isCurrent(entry: PartitionCheckpointEntry): boolean;
	onStateFailure({
		entry,
		cause,
	}: {
		entry: PartitionCheckpointEntry;
		cause: unknown;
	}): void;
}): Promise<void> => {
	const cutoff = clock.now();
	const pending = entries
		.filter((entry) => entry.nextCleanupAt <= cutoff)
		.sort(
			(left, right) =>
				left.nextCleanupAt - right.nextCleanupAt ||
				left.generation - right.generation,
		);
	let spentMs = 0;
	let chunks = 0;
	while (
		pending.length > 0 &&
		spentMs < config.cleanupBudgetMs &&
		chunks < config.maxCleanupChunksPerTurn
	) {
		const entry = pending.shift();
		if (!entry || !isCurrent(entry)) continue;
		const startedAt = clock.monotonicNow();
		try {
			const { deletedCount } = stateStore.pruneExpiredTrackReceipts({
				topic: entry.topic,
				partition: entry.partition,
				expiresAtOrBefore: cutoff,
				limit: config.cleanupBatchSize,
			});
			const durationMs = Math.max(0, clock.monotonicNow() - startedAt);
			spentMs += durationMs;
			chunks += 1;
			entry.health.cleanup.lastPrunedAt = clock.now();
			entry.health.cleanup.lastDurationMs = durationMs;
			entry.health.cleanup.deletedReceipts += deletedCount;
			entry.health.cleanup.failure = null;
			entry.health.cleanup.backlog =
				deletedCount === config.cleanupBatchSize ? "possible" : "clear";
			entry.nextCleanupAt = clock.now() + config.cleanupIntervalMs;
			if (deletedCount === config.cleanupBatchSize) pending.push(entry);
		} catch (cause) {
			entry.health.cleanup.failure = checkpointFailureOf({ cause });
			onStateFailure({ entry, cause });
		}
		await clock.yield();
	}
};
