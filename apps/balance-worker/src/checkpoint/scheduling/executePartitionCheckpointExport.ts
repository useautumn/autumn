import {
	PartitionCheckpointCaptureError,
	type PartitionCheckpointExporter,
} from "../partitionCheckpointExporter.js";
import {
	checkpointFailureOf,
	type PartitionCheckpointEntry,
	PartitionCheckpointExportTimeoutError,
} from "./partitionCheckpointEntry.js";
import {
	checkpointIntervalOf,
	type PartitionCheckpointSchedulerClock,
	type PartitionCheckpointSchedulerConfig,
} from "./partitionCheckpointSchedulerConfig.js";

export const executePartitionCheckpointExport = async ({
	entry,
	exporter,
	clock,
	config,
	isCurrent,
	refresh,
	onStateFailure,
}: {
	entry: PartitionCheckpointEntry;
	exporter: PartitionCheckpointExporter;
	clock: PartitionCheckpointSchedulerClock;
	config: PartitionCheckpointSchedulerConfig;
	isCurrent(entry: PartitionCheckpointEntry): boolean;
	refresh(entry: PartitionCheckpointEntry): boolean;
	onStateFailure({
		entry,
		cause,
	}: {
		entry: PartitionCheckpointEntry;
		cause: unknown;
	}): void;
}): Promise<void> => {
	const controller = new AbortController();
	const startedAt = clock.monotonicNow();
	const attemptedAt = clock.now();
	entry.health.lastAttemptAt = attemptedAt;
	entry.health.status = "exporting";
	entry.inFlightNextOffset = entry.nextOffset;
	entry.changesDuringExportSince = null;
	entry.abortExport = () => controller.abort(entry.signal.reason);
	const cancelDeadline = clock.schedule({
		delayMs: config.exportTimeoutMs,
		run: () =>
			controller.abort(
				new PartitionCheckpointExportTimeoutError({
					timeoutMs: config.exportTimeoutMs,
				}),
			),
	});
	try {
		const result = await exporter.export({
			topic: entry.topic,
			partition: entry.partition,
			signal: controller.signal,
			consumedNextOffset: entry.consumedNextOffset,
		});
		if (!isCurrent(entry) || !refresh(entry)) return;
		entry.health.lastConfirmedNextOffset =
			result.kind === "published" ? result.nextOffset : result.remoteNextOffset;
		if (result.kind === "published")
			entry.health.lastPublishedAt = result.createdAt;
		entry.health.lastSerializedBytes = result.serializedBytes;
		entry.health.failure = null;
		entry.attempt = 0;
		entry.health.dirtySince =
			entry.nextOffset <= entry.health.lastConfirmedNextOffset
				? null
				: (entry.changesDuringExportSince ?? attemptedAt);
		entry.health.status =
			entry.health.dirtySince === null ? "up_to_date" : "waiting";
		entry.nextAttemptAt =
			clock.now() + checkpointIntervalOf({ config, random: clock.random() });
	} catch (cause) {
		if (!isCurrent(entry)) return;
		entry.health.failure = checkpointFailureOf({ cause });
		entry.health.status = "degraded";
		if (cause instanceof PartitionCheckpointCaptureError) {
			onStateFailure({ entry, cause: cause.cause });
			return;
		}
		entry.attempt += 1;
		const retry =
			entry.health.failure.retriable && entry.attempt < config.maxAttempts;
		const delayMs = retry
			? Math.min(
					config.maxBackoffMs,
					config.initialBackoffMs * 2 ** (entry.attempt - 1),
				)
			: checkpointIntervalOf({ config, random: clock.random() });
		entry.nextAttemptAt = clock.now() + delayMs;
		if (!retry) entry.attempt = 0;
	} finally {
		cancelDeadline();
		entry.abortExport = null;
		entry.inFlightNextOffset = null;
		if (isCurrent(entry))
			entry.health.lastDurationMs = Math.max(
				0,
				clock.monotonicNow() - startedAt,
			);
	}
};
