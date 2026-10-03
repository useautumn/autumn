import { BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT } from "@autumn/env/balanceWorkerConstants";
import {
	type CommandRecord,
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
import type { QueuedDecision } from "../../consume/types/queuedDecision.js";
import { isPartitionRestartableCause } from "../../partitions/health/partitionRestartableCauses.js";
import type { PartitionRuntimePort } from "../../partitions/types/partitions.js";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import { CommandPartitionUnavailableError } from "./commandConsumerErrors.js";
import { createDeferredLogs } from "./deferredLogs/createDeferredLogs.js";
import type { CommandConsumerContext } from "./types/commandConsumer.js";
import type { DeferredLogs } from "./types/deferredLogs.js";

/** Where a record sits on the command topic, as its log lines report it. */
type RecordPosition = { topic: string; partition: number; offset: string };

/** The command stream's transport: a record in, its partition's runtime found, the `consume/` layer called. No business logic here. */
export function createCommandRecordHandler({
	ctx,
}: {
	ctx: CommandConsumerContext;
}): TopicRecordHandler {
	const deferredLogsByPartition = new Map<
		number,
		{ runtime: PartitionRuntimePort; logs: DeferredLogs }
	>();

	function deferredLogsOf({
		partition,
		runtime,
	}: {
		partition: number;
		runtime: PartitionRuntimePort;
	}): DeferredLogs {
		const existing = deferredLogsByPartition.get(partition);
		if (existing?.runtime === runtime) return existing.logs;
		const logs = createDeferredLogs({
			maxCommitsInFlight: BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT,
		});
		deferredLogsByPartition.set(partition, { runtime, logs });
		return logs;
	}

	async function settleBatch({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): Promise<void> {
		const deferred = deferredLogsByPartition.get(partition);
		if (!deferred) return;
		deferredLogsByPartition.delete(partition);
		if (deferred.runtime !== ctx.findOwnedRuntime({ partition })) return;
		try {
			await deferred.logs.settle();
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

	/** A record holds the stream only until its command is decided; its commit joins the batch, which settles before its offset. */
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
		const deferredLogs = deferredLogsOf({ partition, runtime });
		await deferredLogs.waitForRoom();
		const position = { topic, partition, offset: offset.toString() };
		try {
			const decided = await runtime.process((processor) =>
				processor.execute({
					source: { commandOffset: position.offset },
					run: (processor) => decideRecord({ processor, message, position }),
					deferredLogs: deferredLogs.logs,
				}),
			);
			if (decided) deferredLogs.add(decided.waitForCommit());
		} catch (cause) {
			parkOrRethrow({ topic, partition, offset, cause });
		}
	}

	/** Decides the record's command in arrival order. A refused or already applied command is consumed here, whether it failed at its decide or at its commit. */
	async function decideRecord({
		processor,
		message,
		position,
	}: {
		processor: PartitionProcessor;
		message: TopicRecord["message"];
		position: RecordPosition;
	}): Promise<{ waitForCommit(): Promise<void> } | undefined> {
		let command: CommandRecord;
		try {
			command = parseCommandRecord({ key: message.key, value: message.value });
		} catch (cause) {
			// A record nobody can read must not take the partition down with it.
			ctx.logger?.warn("Queued command skipped: unreadable", {
				...position,
				error: cause,
			});
			return undefined;
		}
		try {
			const decided = await decideCommand({ processor, command, position });
			if (!decided) return undefined;
			return { waitForCommit: () => settleCommit({ command, decided }) };
		} catch (cause) {
			settleQueuedFailure({ ctx: { logger: ctx.logger }, command, cause });
			return undefined;
		}
	}

	async function decideCommand({
		processor,
		command,
		position,
	}: {
		processor: PartitionProcessor;
		command: CommandRecord;
		position: RecordPosition;
	}): Promise<QueuedDecision | undefined> {
		const consumeCtx = {
			processor,
			idempotencyKeys: ctx.idempotencyKeys,
			logger: ctx.logger,
		};
		switch (command.type) {
			case "track":
				return consumeTrack({ ctx: consumeCtx, command });
			case "reset":
				return consumeReset({ ctx: consumeCtx, command });
			case "evict":
				await consumeEvict({ ctx: consumeCtx, command });
				return undefined;
			case "updateBalance":
				return consumeUpdateBalance({ ctx: consumeCtx, command });
			default:
				ctx.logger?.warn("Queued command skipped: not consumable yet", {
					...position,
					commandType: command.type,
					commandId: command.commandId,
				});
				return undefined;
		}
	}

	/** A commit that fails after its decide settles where a failed decide does; only a transient failure reaches the batch. */
	async function settleCommit({
		command,
		decided,
	}: {
		command: CommandRecord;
		decided: QueuedDecision;
	}): Promise<void> {
		try {
			await decided.waitForCommit();
		} catch (cause) {
			settleQueuedFailure({ ctx: { logger: ctx.logger }, command, cause });
		}
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
