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
import { consumeFinalize } from "../../consume/consumeFinalize.js";
import { consumeReset } from "../../consume/consumeReset.js";
import {
	claimTrackBatch,
	consumeTrack,
	type TrackClaims,
} from "../../consume/consumeTrack.js";
import { consumeUpdateBalance } from "../../consume/consumeUpdateBalance.js";
import {
	classifyQueuedFailure,
	settleQueuedFailure,
} from "../../consume/settleQueuedFailure.js";
import type { QueuedCommand } from "../../consume/types/queuedCommand.js";
import {
	type DecideSteps,
	takeDecideSteps,
} from "../../logging/benchDecideSteps.js";
import { getBalanceWorkerLogger } from "../../logging/getBalanceWorkerLogger.js";
import { isPartitionRestartableCause } from "../../partitions/health/partitionRestartableCauses.js";
import type { PartitionRuntimePort } from "../../partitions/types/partitions.js";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { CommittedMutation } from "../../processor/writer/types/mutation.js";
import { CommandPartitionUnavailableError } from "./commandConsumerErrors.js";
import { createDeferredLogs } from "./deferredLogs/createDeferredLogs.js";
import type { CommandConsumerContext } from "./types/commandConsumer.js";
import type { DeferredLogs } from "./types/deferredLogs.js";

const isCommittedMutation = (
	committed: unknown,
): committed is CommittedMutation =>
	typeof committed === "object" &&
	committed !== null &&
	"mutation" in committed;

/** An Atom's track that landed only its seq: the engine or the consumer turned it into a track of nothing. */
const isAtomTrackOfNothing = ({
	command,
	committed,
}: {
	command: CommandRecord;
	committed: unknown;
}): boolean =>
	command.type === "track" &&
	command.source !== undefined &&
	command.value !== 0 &&
	isCommittedMutation(committed) &&
	committed.mutation.command.type === "track" &&
	committed.mutation.command.value === 0;

// BENCH-ONLY: where one consumed batch's wall time went, per stage.
type BatchStageTiming = {
	startedAt: number;
	betweenBatchesMs: number | null;
	batchSize: number;
	records: number;
	beginMs: number;
	waitForRoomMs: number;
	hopMs: number;
	decideMs: number;
	commitMs: number[];
	consumeMs: number;
	steps: DecideSteps;
	kinds: Record<string, number>;
};

const newBatchStageTiming = (): BatchStageTiming => ({
	startedAt: performance.now(),
	betweenBatchesMs: null,
	batchSize: 0,
	records: 0,
	beginMs: 0,
	waitForRoomMs: 0,
	hopMs: 0,
	decideMs: 0,
	commitMs: [],
	consumeMs: 0,
	steps: { claimMs: 0, hydrateMs: 0, resetMs: 0, resetDue: 0, computeMs: 0 },
	kinds: {},
});

const round = (ms: number) => Math.round(ms * 100) / 100;

const recordKindOf = ({ command }: { command: CommandRecord }): string => {
	if (command.type !== "track") return command.type;
	if (!command.source) return "apiTrack";
	return command.idempotency?.key === `track:${command.requestId}`
		? "atomKeyless"
		: "atomKeyed";
};

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
	/** Per partition, the Atom tracks this batch landed as nothing: a resend can be a whole journal, so one line per batch. */
	const atomTracksOfNothing = new Map<number, number>();
	const trackClaimsByPartition = new Map<number, TrackClaims>();
	// BENCH-ONLY (bench/bw-stage-timing-363): per-batch stage timing for one partition's queued apply.
	const stageTimings = new Map<number, BatchStageTiming>();
	const lastSettledAt = new Map<number, number>();
	const timingOf = (partition: number): BatchStageTiming => {
		const existing = stageTimings.get(partition);
		if (existing) return existing;
		const created = newBatchStageTiming();
		const settledAt = lastSettledAt.get(partition);
		created.betweenBatchesMs =
			settledAt === undefined ? null : created.startedAt - settledAt;
		stageTimings.set(partition, created);
		return created;
	};

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
			maxInFlight: BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT,
		});
		deferredLogsByPartition.set(partition, { runtime, logs });
		return logs;
	}

	/** Claims the batch's track keys together before its first record applies; a record the bookmark skips claims nothing. */
	function beginBatch({
		partition,
		messages,
	}: {
		partition: number;
		messages: TopicRecord["message"][];
	}): void {
		const timing = newBatchStageTiming();
		stageTimings.set(partition, timing);
		const settledAt = lastSettledAt.get(partition);
		timing.betweenBatchesMs =
			settledAt === undefined ? null : timing.startedAt - settledAt;
		const bookmark = ctx.readCommandNextOffset({ partition });
		const tracks = messages.flatMap((message) => {
			const offset = parseKafkaOffset({ offset: message.offset });
			if (bookmark !== null && offset < bookmark) return [];
			try {
				const command = parseCommandRecord(message);
				return command.type === "track" ? [command] : [];
			} catch {
				return [];
			}
		});
		trackClaimsByPartition.set(
			partition,
			claimTrackBatch({ ctx, commands: tracks }),
		);
		timing.beginMs = performance.now() - timing.startedAt;
	}

	async function settleBatch({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): Promise<void> {
		trackClaimsByPartition.delete(partition);
		const timing = timingOf(partition);
		stageTimings.delete(partition);
		const settleStartedAt = performance.now();
		try {
			const deferred = deferredLogsByPartition.get(partition);
			if (!deferred) return;
			deferredLogsByPartition.delete(partition);
			if (deferred.runtime !== ctx.findOwnedRuntime({ partition })) return;
			try {
				await deferred.logs.settle();
			} catch (cause) {
				parkOrRethrow({ topic, partition, cause });
			}
		} finally {
			const settledAt = performance.now();
			lastSettledAt.set(partition, settledAt);
			logBatchStageTiming({
				timing,
				topic,
				partition,
				settleMs: settledAt - settleStartedAt,
				settledAt,
			});
		}
		const count = atomTracksOfNothing.get(partition);
		atomTracksOfNothing.delete(partition);
		if (count)
			ctx.logger?.info(
				"Queued Atom tracks deducted nothing: already applied, duplicate or refused",
				{ topic, partition, count },
			);
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
		timingOf(partition).batchSize += 1;
		const runtime = ctx.findOwnedRuntime({ partition });
		if (!runtime)
			throw new CommandPartitionUnavailableError({ topic, partition });
		const bookmark = ctx.readCommandNextOffset({ partition });
		if (bookmark !== null && offset < bookmark) return { nextOffset: bookmark };
		const deferredLogs = deferredLogsOf({ partition, runtime });
		const timing = timingOf(partition);
		const roomStartedAt = performance.now();
		await deferredLogs.waitForRoom();
		const processStartedAt = performance.now();
		timing.waitForRoomMs += processStartedAt - roomStartedAt;
		timing.records += 1;
		const position = { topic, partition, offset: offset.toString() };
		try {
			let decideStartedAt = processStartedAt;
			const decided = await runtime.process((processor) => {
				decideStartedAt = performance.now();
				return processor.execute({
					source: { commandOffset: position.offset },
					run: (processor) => decideRecord({ processor, message, position }),
					deferredLogs,
				});
			});
			const decidedAt = performance.now();
			timing.hopMs += decideStartedAt - processStartedAt;
			timing.decideMs += decidedAt - decideStartedAt;
			if (decided)
				deferredLogs.add(
					settleCommit({ ...decided, partition }).finally(() =>
						timing.commitMs.push(performance.now() - decidedAt),
					),
				);
		} catch (cause) {
			parkOrRethrow({ topic, partition, offset, cause });
		}
	}

	/** Decides the record's command in arrival order. A refused or already applied decide is consumed here. */
	async function decideRecord({
		processor,
		message,
		position,
	}: {
		processor: PartitionProcessor;
		message: TopicRecord["message"];
		position: RecordPosition;
	}): Promise<{ command: CommandRecord; queued: QueuedCommand } | null> {
		let command: CommandRecord;
		try {
			command = parseCommandRecord({ key: message.key, value: message.value });
		} catch (cause) {
			// A record nobody can read must not take the partition down with it.
			ctx.logger?.warn("Queued command skipped: unreadable", {
				...position,
				error: cause,
			});
			return null;
		}
		const consumeCtx = {
			processor,
			idempotencyKeys: ctx.idempotencyKeys,
			logger: ctx.logger,
		};
		const timing = timingOf(position.partition);
		const kind = recordKindOf({ command });
		timing.kinds[kind] = (timing.kinds[kind] ?? 0) + 1;
		const consumeStartedAt = performance.now();
		let queued: QueuedCommand | null = null;
		try {
			switch (command.type) {
				case "track":
					queued = await consumeTrack({
						ctx: consumeCtx,
						command,
						claims: trackClaimsByPartition.get(position.partition),
					});
					break;
				case "reset":
					queued = await consumeReset({ ctx: consumeCtx, command });
					break;
				case "evict":
					await consumeEvict({ ctx: consumeCtx, command });
					break;
				case "updateBalance":
					queued = await consumeUpdateBalance({ ctx: consumeCtx, command });
					break;
				case "finalize":
					queued = await consumeFinalize({ ctx: consumeCtx, command });
					break;
				default:
					ctx.logger?.warn("Queued command skipped: not consumable yet", {
						...position,
						commandType: command.type,
						commandId: command.commandId,
					});
			}
		} catch (cause) {
			settleQueuedFailure({ ctx: { logger: ctx.logger }, command, cause });
		}
		timing.consumeMs += performance.now() - consumeStartedAt;
		const steps = takeDecideSteps({
			commandId:
				"commandId" in command && typeof command.commandId === "string"
					? command.commandId
					: command.requestId,
		});
		for (const step of Object.keys(steps) as (keyof DecideSteps)[])
			timing.steps[step] += steps[step];
		return queued && { command, queued };
	}

	/** Everything after the decide: the balance's verdict once committed, or the failure settled as a failed decide is.
	 *  Only a transient failure reaches the batch, so Kafka redelivers the record. */
	async function settleCommit({
		command,
		queued,
		partition,
	}: {
		command: CommandRecord;
		queued: QueuedCommand;
		partition: number;
	}): Promise<void> {
		try {
			const committed = await queued.decided.waitForCommit();
			logRejection({ command, committed });
			if (isAtomTrackOfNothing({ command, committed }))
				atomTracksOfNothing.set(
					partition,
					(atomTracksOfNothing.get(partition) ?? 0) + 1,
				);
			else logAtomTrackApplied({ command, committed });
		} catch (cause) {
			if (classifyQueuedFailure({ cause }) === "refused")
				await queued.onRefused?.();
			settleQueuedFailure({ ctx: { logger: ctx.logger }, command, cause });
		}
	}

	/** Every Atom track that deducted, by its journal entry, so a double apply shows as one entry logged twice. */
	function logAtomTrackApplied({
		command,
		committed,
	}: {
		command: CommandRecord;
		committed: unknown;
	}): void {
		if (command.type !== "track" || !command.source) return;
		if (!isCommittedMutation(committed) || committed.kind === "duplicate")
			return;
		ctx.logger?.info("Queued Atom track applied", {
			commandId: command.commandId,
			customerId: command.identity.customerId,
			atomId: command.source.atomId,
			writerId: command.source.writerId,
			seq: command.source.seq,
		});
	}

	/** A deduction the balance could not fund committed as rejected: nothing moved, and nobody is waiting to hear it. */
	function logRejection({
		command,
		committed,
	}: {
		command: CommandRecord;
		committed: unknown;
	}): void {
		if (!isCommittedMutation(committed)) return;
		const { result } = committed.mutation;
		if (!("status" in result) || result.status !== "rejected") return;
		ctx.logger?.warn(`Queued ${command.type} rejected by the balance`, {
			commandId: "commandId" in command ? command.commandId : undefined,
			requestId: command.requestId,
			customerId: command.identity.customerId,
			reason: "reason" in result ? result.reason : undefined,
		});
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

	function logBatchStageTiming({
		timing,
		topic,
		partition,
		settleMs,
		settledAt,
	}: {
		timing: BatchStageTiming;
		topic: string;
		partition: number;
		settleMs: number;
		settledAt: number;
	}): void {
		if (timing.records === 0) return;
		const commits = [...timing.commitMs].sort((a, b) => a - b);
		const at = (p: number) =>
			round(
				commits[Math.min(commits.length - 1, Math.floor(commits.length * p))] ??
					0,
			);
		getBalanceWorkerLogger().info("Queued batch stage timing", {
			event: "balance_worker.queued_batch_timing",
			topic,
			partition,
			batchSize: timing.batchSize,
			records: timing.records,
			wallMs: round(settledAt - timing.startedAt),
			betweenBatchesMs:
				timing.betweenBatchesMs === null
					? null
					: round(timing.betweenBatchesMs),
			beginMs: round(timing.beginMs),
			waitForRoomMs: round(timing.waitForRoomMs),
			hopMs: round(timing.hopMs),
			decideMs: round(timing.decideMs),
			settleMs: round(settleMs),
			commits: commits.length,
			commitMsP50: at(0.5),
			commitMsP99: at(0.99),
			commitMsMax: round(commits.at(-1) ?? 0),
			consumeMs: round(timing.consumeMs),
			claimMs: round(timing.steps.claimMs),
			hydrateMs: round(timing.steps.hydrateMs),
			resetMs: round(timing.steps.resetMs),
			resetDue: timing.steps.resetDue,
			computeMs: round(timing.steps.computeMs),
			kinds: timing.kinds,
		});
	}

	return { readResumeOffset, beginBatch, applyRecord, settleBatch };
}
