import type { MutationSource } from "@autumn/balance-engine";
import { BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT } from "@autumn/env/balanceWorkerConstants";
import {
	parseCommandRecord,
	parseKafkaOffset,
	type TopicRecord,
	type TopicRecordHandler,
	type TopicRecordResult,
	type TopicResumePosition,
} from "@autumn/kafka";
import { consumeEvict } from "../../consume/consumeEvict.js";
import { consumeReset } from "../../consume/consumeReset.js";
import { consumeTrack } from "../../consume/consumeTrack.js";
import { consumeUpdateBalance } from "../../consume/consumeUpdateBalance.js";
import { settleQueuedFailure } from "../../consume/settleQueuedFailure.js";
import { isPartitionRestartableCause } from "../../partitions/health/partitionRestartableCauses.js";
import type { PartitionRuntimePort } from "../../partitions/types/partitions.js";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import { CommandPartitionUnavailableError } from "./commandConsumerErrors.js";
import type { CommandConsumerContext } from "./types/commandConsumer.js";

/** One batch's queued work still landing: held evict records and decided commands awaiting their commit. */
type DeferredWork = {
	runtime: PartitionRuntimePort;
	logs: Promise<void>[];
	committing: Set<Promise<void>>;
};

function ignoreOutcome(): void {}

/** The command stream's transport: a record in, its partition's runtime found, the `consume/` layer called. No business logic here. */
export function createCommandRecordHandler({
	ctx,
}: {
	ctx: CommandConsumerContext;
}): TopicRecordHandler {
	const deferredWorkByPartition = new Map<number, DeferredWork>();

	function deferredWorkOf({
		partition,
		runtime,
	}: {
		partition: number;
		runtime: PartitionRuntimePort;
	}): DeferredWork {
		const existing = deferredWorkByPartition.get(partition);
		if (existing?.runtime === runtime) return existing;
		const deferred: DeferredWork = { runtime, logs: [], committing: new Set() };
		deferredWorkByPartition.set(partition, deferred);
		return deferred;
	}

	async function settleBatch({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): Promise<void> {
		const deferred = deferredWorkByPartition.get(partition);
		if (!deferred) return;
		deferredWorkByPartition.delete(partition);
		if (deferred.runtime !== ctx.findOwnedRuntime({ partition })) return;
		try {
			await Promise.all(deferred.logs);
		} catch (cause) {
			parkOrRethrow({ topic, partition, cause });
		}
	}

	/** Postgres says how far the commands are decided; a batch starting below that is skipped forward, never re-decided. */
	function readResumeOffset({
		partition,
		firstOffset,
	}: TopicResumePosition): bigint | null {
		const bookmark = ctx.readCommandNextOffset({ partition });
		if (bookmark === null || firstOffset >= bookmark) return null;
		return bookmark;
	}

	async function applyRecord({
		topic,
		partition,
		message,
	}: TopicRecord): Promise<TopicRecordResult> {
		const offset = parseKafkaOffset({ offset: message.offset });
		const runtime = ctx.findOwnedRuntime({ partition });
		if (!runtime)
			throw new CommandPartitionUnavailableError({ topic, partition });
		const bookmark = ctx.readCommandNextOffset({ partition });
		if (bookmark !== null && offset < bookmark) return { nextOffset: bookmark };
		const source = { commandOffset: offset.toString() };
		async function run(processor: PartitionProcessor) {
			let command: ReturnType<typeof parseCommandRecord>;
			try {
				command = parseCommandRecord({
					key: message.key,
					value: message.value,
				});
			} catch (cause) {
				// A record nobody can read must not take the partition down with it.
				ctx.logger?.warn("Queued command skipped: unreadable", {
					topic,
					partition,
					offset: offset.toString(),
					error: cause,
				});
				return;
			}
			try {
				switch (command.type) {
					case "track":
						await consumeTrack({
							ctx: {
								processor,
								idempotencyKeys: ctx.idempotencyKeys,
								logger: ctx.logger,
							},
							command,
						});
						break;
					case "reset":
						await consumeReset({
							ctx: { processor, logger: ctx.logger },
							command,
						});
						break;
					case "evict":
						await consumeEvict({ ctx: { processor }, command });
						break;
					case "updateBalance":
						await consumeUpdateBalance({
							ctx: { processor, logger: ctx.logger },
							command,
						});
						break;
					default:
						ctx.logger?.warn("Queued command skipped: not consumable yet", {
							topic,
							partition,
							offset: offset.toString(),
							commandType: command.type,
							commandId: command.commandId,
						});
				}
			} catch (cause) {
				settleQueuedFailure({ ctx: { logger: ctx.logger }, command, cause });
			}
		}
		const deferred = deferredWorkOf({ partition, runtime });
		await waitForCommitRoom({ deferred });
		try {
			await processUntilDecided({ runtime, source, run, deferred });
		} catch (cause) {
			parkOrRethrow({ topic, partition, offset, cause });
		}
	}

	/** A queued command holds the stream only until it is decided, so the records behind it can
	 *  share its Kafka commit; the rest of its run joins the batch, which settles before its offset. */
	async function processUntilDecided({
		runtime,
		source,
		run,
		deferred,
	}: {
		runtime: PartitionRuntimePort;
		source: MutationSource;
		run: (processor: PartitionProcessor) => Promise<void>;
		deferred: DeferredWork;
	}): Promise<void> {
		const decided = Promise.withResolvers<"decided">();
		function markDecided(): void {
			decided.resolve("decided");
		}
		const processed = runtime.process((processor) =>
			processor.execute({
				source,
				run,
				deferredLogs: deferred.logs,
				onDecided: markDecided,
			}),
		);
		const first = await Promise.race([decided.promise, processed]);
		if (first !== "decided") return;
		deferred.logs.push(processed);
		const settled = processed.then(ignoreOutcome, ignoreOutcome);
		deferred.committing.add(settled);
		void settled.then(() => deferred.committing.delete(settled));
	}

	/** Bounds how far decides run ahead of their commits, well inside the writer's pending capacity. */
	async function waitForCommitRoom({
		deferred,
	}: {
		deferred: DeferredWork;
	}): Promise<void> {
		while (deferred.committing.size >= BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT)
			await Promise.race(deferred.committing);
	}

	/** A batch the broker refused says the partition fell behind, not that the worker is broken:
	 *  the partition is parked and restarted alone, and the record stays unconsumed for the restart
	 *  to read again from the bookmark. Thrown into kafkajs instead, the same failure retries the
	 *  batch a few times and then crashes the consumer every partition on this task shares, which
	 *  takes the whole task down. Any other failure still goes to Kafka for redelivery. */
	function parkOrRethrow({
		topic,
		partition,
		offset,
		cause,
	}: {
		topic: string;
		partition: number;
		offset?: bigint;
		cause: unknown;
	}): never | undefined {
		if (!ctx.markUnavailable || !isPartitionRestartableCause({ cause }))
			throw cause;
		ctx.logger?.warn(
			"Queued command could not be committed; parking the partition",
			{ topic, partition, offset: offset?.toString(), error: cause },
		);
		ctx.markUnavailable({ partition, cause });
		return undefined;
	}

	return { readResumeOffset, applyRecord, settleBatch };
}
