import { PartitionProgressNotFoundError } from "../../state/sqliteBalanceStateErrors.js";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import type { PartitionCheckpointExporter } from "../partitionCheckpointExporter.js";
import { executePartitionCheckpointExport } from "./executePartitionCheckpointExport.js";
import {
	checkpointFailureOf,
	initialCheckpointHealth,
	type PartitionCheckpointEntry,
} from "./partitionCheckpointEntry.js";
import type { PartitionCheckpointMaintenance } from "./partitionCheckpointMaintenance.js";
import { planPartitionCheckpoint } from "./partitionCheckpointSchedule.js";
import {
	assertPartitionCheckpointSchedulerConfig,
	checkpointIntervalOf,
	defaultPartitionCheckpointSchedulerConfig,
	type PartitionCheckpointSchedulerClock,
	type PartitionCheckpointSchedulerConfig,
	partitionCheckpointSchedulerClock,
} from "./partitionCheckpointSchedulerConfig.js";
import { prunePartitionCheckpointReceipts } from "./prunePartitionCheckpointReceipts.js";

export const createPartitionCheckpointScheduler = ({
	stateStore,
	exporter,
	clock = partitionCheckpointSchedulerClock,
	config = defaultPartitionCheckpointSchedulerConfig,
}: {
	stateStore: Pick<
		SqliteBalanceStateStore,
		"readNextOffset" | "pruneExpiredTrackReceipts"
	>;
	exporter: PartitionCheckpointExporter;
	clock?: PartitionCheckpointSchedulerClock;
	config?: PartitionCheckpointSchedulerConfig;
}): PartitionCheckpointMaintenance & { stop(): void } => {
	assertPartitionCheckpointSchedulerConfig({ config });
	const entries = new Map<number, PartitionCheckpointEntry>();
	let nextGeneration = 0;
	let stopped = false;
	let exportInFlight = false;
	let cleanupInFlight = false;
	let cancelTick: (() => void) | null = null;
	const isCurrent = (entry: PartitionCheckpointEntry): boolean =>
		!stopped &&
		!entry.signal.aborted &&
		entries.get(entry.generation) === entry;

	const remove = (entry: PartitionCheckpointEntry): void => {
		entries.delete(entry.generation);
		entry.removeAbortListener();
		entry.abortExport?.();
		entry.health.status = "stopped";
		if (entries.size === 0) {
			cancelTick?.();
			cancelTick = null;
		}
	};
	const onStateFailure = ({
		entry,
		cause,
	}: {
		entry: PartitionCheckpointEntry;
		cause: unknown;
	}): void => {
		entry.health.failure = checkpointFailureOf({ cause });
		remove(entry);
		entry.onStateFailure({ cause });
	};
	const refresh = (entry: PartitionCheckpointEntry): boolean => {
		if (!isCurrent(entry)) return false;
		try {
			const local = stateStore.readNextOffset({
				topic: entry.topic,
				partition: entry.partition,
			});
			if (local === null)
				throw new PartitionProgressNotFoundError({
					topic: entry.topic,
					partition: entry.partition,
				});
			const consumed = entry.readConsumedNextOffset();
			if (consumed !== null && consumed < 0n)
				throw new RangeError("Consumed next offset cannot be negative");
			entry.consumedNextOffset = consumed;
			entry.nextOffset =
				consumed !== null && consumed > local ? consumed : local;
			const confirmed = entry.health.lastConfirmedNextOffset;
			if (confirmed === null || entry.nextOffset > confirmed) {
				entry.health.dirtySince ??= clock.now();
				if (
					entry.inFlightNextOffset !== null &&
					entry.nextOffset > entry.inFlightNextOffset
				)
					entry.changesDuringExportSince ??= clock.now();
				if (entry.health.status === "up_to_date")
					entry.health.status = "waiting";
			}
			return true;
		} catch (cause) {
			onStateFailure({ entry, cause });
			return false;
		}
	};

	const tick = (): void => {
		cancelTick = null;
		if (stopped || entries.size === 0) return;
		const current = [...entries.values()].filter(refresh);
		const plan = planPartitionCheckpoint({
			now: clock.now(),
			exportInFlight,
			entries: current.map((entry) => ({
				generation: entry.generation,
				nextOffset: entry.nextOffset,
				lastConfirmedNextOffset: entry.health.lastConfirmedNextOffset,
				dirtySince: entry.health.dirtySince ?? clock.now(),
				nextAttemptAt: entry.nextAttemptAt,
			})),
		});
		if (plan.kind === "export") {
			const entry = entries.get(plan.generation);
			if (entry && isCurrent(entry)) {
				exportInFlight = true;
				void executePartitionCheckpointExport({
					entry,
					exporter,
					clock,
					config,
					isCurrent,
					refresh,
					onStateFailure,
				}).finally(() => {
					exportInFlight = false;
					cancelTick?.();
					cancelTick = null;
					arm({ delayMs: 0 });
				});
			}
		}
		if (!cleanupInFlight) {
			cleanupInFlight = true;
			void prunePartitionCheckpointReceipts({
				entries: current,
				stateStore,
				clock,
				config,
				isCurrent,
				onStateFailure,
			}).finally(() => {
				cleanupInFlight = false;
			});
		}
		arm();
	};
	const arm = ({
		delayMs = config.pollIntervalMs,
	}: {
		delayMs?: number;
	} = {}): void => {
		if (!stopped && entries.size > 0 && cancelTick === null)
			cancelTick = clock.schedule({
				delayMs,
				run: tick,
			});
	};

	const start: PartitionCheckpointMaintenance["start"] = (assignment) => {
		if (stopped) throw new Error("Partition checkpoint scheduler is stopped");
		for (const entry of entries.values()) {
			if (
				entry.topic === assignment.topic &&
				entry.partition === assignment.partition
			)
				throw new Error(
					"Partition checkpoint assignment is already registered",
				);
		}
		const now = clock.now();
		const entry: PartitionCheckpointEntry = {
			...assignment,
			generation: nextGeneration++,
			nextOffset: 0n,
			consumedNextOffset: null,
			nextAttemptAt:
				now + checkpointIntervalOf({ config, random: clock.random() }),
			nextCleanupAt: now + config.cleanupIntervalMs,
			health: initialCheckpointHealth({ now }),
			attempt: 0,
			inFlightNextOffset: null,
			changesDuringExportSince: null,
			abortExport: null,
			removeAbortListener: () =>
				assignment.signal.removeEventListener("abort", abort),
		};
		const abort = (): void => remove(entry);
		if (assignment.signal.aborted) entry.health.status = "stopped";
		else {
			entries.set(entry.generation, entry);
			assignment.signal.addEventListener("abort", abort, { once: true });
			arm();
		}
		return {
			getHealth: () => {
				const health = entry.health;
				return {
					...health,
					uncheckpointedAgeMs:
						health.dirtySince === null
							? 0
							: Math.max(0, clock.now() - health.dirtySince),
					failure: health.failure ? { ...health.failure } : null,
					cleanup: {
						...health.cleanup,
						failure: health.cleanup.failure
							? { ...health.cleanup.failure }
							: null,
					},
				};
			},
		};
	};
	return {
		start,
		stop: () => {
			stopped = true;
			for (const entry of entries.values()) remove(entry);
			cancelTick?.();
			cancelTick = null;
		},
	};
};
