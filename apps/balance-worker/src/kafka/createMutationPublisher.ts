import { BALANCE_WORKER_COMMAND_OFFSET_SETTLE_GAP_MS } from "@autumn/env/balanceWorkerConstants";
import {
	createMeteringPublisher,
	KafkaBatchNotCommittedError,
	type KafkaCommitMode,
	type KafkaOffsetCommit,
	type KafkaProducer,
	type MeteringRecord,
	sendTransactionalOffsets,
	serializeMeteringRecord,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import { timeSync } from "../logging/eventLoopStalls/syncSections.js";
import type { PartitionLoad } from "../processor/writer/partitionLoad/createPartitionLoad.js";
import type { ProducedOffsets } from "../processor/writer/producedOffsets/createProducedOffsets.js";
import type { CommittedOutcomeAppender } from "../processor/writer/types/partitionWriter.js";
import { MutationBatchNotCommittedError } from "../processor/writer/writerErrors.js";
import { translateKafkaProducerError } from "./workerKafkaErrors.js";

export function createMutationPublisher({
	ctx,
	config,
}: {
	ctx: {
		producer: KafkaProducer;
		producedOffsets?: ProducedOffsets;
		partitionLoad?: PartitionLoad;
		/** Defaults to transactional. */
		commit?: { mode: KafkaCommitMode };
		ownerEpoch?(): string | undefined;
		commandOffsets?: { commit(offsets: KafkaOffsetCommit): Promise<void> };
		logger?: Partial<Pick<AutumnLogger, "warn">>;
		/** Defaults to a real timer and the settle gap constant; tests drive it by hand. */
		settle?: CommandOffsetSettleTiming;
	};
	config?: { commandTopic: string; groupId: string };
}): Required<CommittedOutcomeAppender> {
	const settle = ctx.settle ?? defaultSettleTiming();
	const settling: CommandOffsetSettling = {
		target: null,
		pending: null,
		landed: null,
		landedAt: null,
		inFlight: null,
		cancelScheduled: null,
		failure: null,
	};
	const publisher = createMeteringPublisher({
		ctx: {
			producer: ctx.producer,
			commit: ctx.commit,
			ownerEpoch: ctx.ownerEpoch,
			commandOffsets: ctx.commandOffsets,
		},
	});

	async function appendCommitted({
		topic,
		partition,
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
	}): Promise<{ baseOffset: bigint }> {
		try {
			let commandNextOffset: bigint | undefined;
			for (const record of outcomes) {
				if (!record.source) continue;
				const next = BigInt(record.source.commandOffset) + 1n;
				if (commandNextOffset === undefined || next > commandNextOffset)
					commandNextOffset = next;
			}
			// A skipped command that is still waiting to land rides with this batch.
			commandNextOffset = carryPendingOffset({ commandNextOffset });
			const offsets =
				commandNextOffset !== undefined
					? offsetsOf({ partition, nextOffset: commandNextOffset })
					: undefined;
			const appended = await publisher.append({
				topic,
				partition,
				records: outcomes,
				offsets,
			});
			if (commandNextOffset !== undefined)
				markLanded({ nextOffset: commandNextOffset });
			ctx.producedOffsets?.remember({
				from: appended.baseOffset,
				to: appended.baseOffset + BigInt(outcomes.length) - 1n,
			});
			ctx.partitionLoad?.record({ partition, bytes: bytesOf({ outcomes }) });
			return appended;
		} catch (cause) {
			const translated = translateKafkaProducerError({
				topic,
				partition,
				cause,
			});
			if (translated !== cause) throw translated;
			if (cause instanceof KafkaBatchNotCommittedError) {
				throw new MutationBatchNotCommittedError({ cause: cause.cause });
			}
			throw cause;
		}
	}

	/** Serialising here is not wasted: the encoding is kept on the record and reused when it is sent. */
	function encodedBytesOf({ record }: { record: MeteringRecord }): number {
		const { key, value } = timeSync({ label: "record.encode" }, () =>
			serializeMeteringRecord({ record }),
		);
		return key.length + value.length;
	}

	/** The encodings were kept when the batch was measured, so this is a sum, not a second serialisation. */
	function bytesOf({
		outcomes,
	}: {
		outcomes: readonly MeteringRecord[];
	}): number {
		let bytes = 0;
		for (const record of outcomes) bytes += encodedBytesOf({ record });
		return bytes;
	}

	function offsetsOf({
		partition,
		nextOffset,
	}: {
		partition: number;
		nextOffset: bigint;
	}) {
		if (!config)
			throw new Error("Command topic and consumer group are required");
		return {
			consumerGroupId: config.groupId,
			topics: [
				{
					topic: config.commandTopic,
					partitions: [{ partition, offset: nextOffset.toString() }],
				},
			],
		};
	}

	async function commitCommandOffset({
		topic,
		partition,
		nextOffset,
	}: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): Promise<void> {
		try {
			const offsets = offsetsOf({ partition, nextOffset });
			if (ctx.commit?.mode === "idempotent") {
				if (!ctx.commandOffsets)
					throw new Error("Idempotent commits need a command offset committer");
				await ctx.commandOffsets.commit(offsets);
				markLanded({ nextOffset });
				return;
			}
			await sendTransactionalOffsets({ producer: ctx.producer, offsets });
			markLanded({ nextOffset });
		} catch (cause) {
			throw translateKafkaProducerError({ topic, partition, cause });
		}
	}

	function carryPendingOffset({
		commandNextOffset,
	}: {
		commandNextOffset: bigint | undefined;
	}): bigint | undefined {
		const pending = settling.pending;
		if (pending === null) return commandNextOffset;
		if (commandNextOffset === undefined || pending > commandNextOffset)
			return pending;
		return commandNextOffset;
	}

	function markLanded({ nextOffset }: { nextOffset: bigint }): void {
		if (settling.landed === null || nextOffset > settling.landed)
			settling.landed = nextOffset;
		settling.landedAt = settle.now();
		if (settling.pending !== null && settling.pending <= settling.landed)
			settling.pending = null;
		if (settling.pending === null) cancelScheduledFlush();
	}

	function cancelScheduledFlush(): void {
		const cancel = settling.cancelScheduled;
		settling.cancelScheduled = null;
		if (cancel) cancel();
	}

	function settleCommandOffset({
		topic,
		partition,
		nextOffset,
	}: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): void {
		if (settling.failure !== null) throw settling.failure;
		if (settling.landed !== null && nextOffset <= settling.landed) return;
		settling.target = { topic, partition };
		if (settling.pending === null || nextOffset > settling.pending)
			settling.pending = nextOffset;
		scheduleFlush();
	}

	/** One landing at a time, and never within the gap of the last: whatever settles meanwhile joins the next. */
	function scheduleFlush(): void {
		if (settling.inFlight || settling.cancelScheduled) return;
		const sinceLanded =
			settling.landedAt === null
				? settle.gapMs
				: settle.now() - settling.landedAt;
		const delayMs = Math.max(0, settle.gapMs - sinceLanded);
		settling.cancelScheduled = settle.schedule(runScheduledFlush, delayMs);
	}

	function runScheduledFlush(): void {
		settling.cancelScheduled = null;
		void flushPending();
	}

	function flushPending(): Promise<void> {
		if (settling.inFlight) return settling.inFlight;
		const target = settling.target;
		const nextOffset = settling.pending;
		if (target === null || nextOffset === null) return Promise.resolve();
		if (settling.landed !== null && nextOffset <= settling.landed) {
			settling.pending = null;
			return Promise.resolve();
		}
		settling.pending = null;
		settling.inFlight = landPending({ ...target, nextOffset });
		return settling.inFlight;
	}

	/** A failure sticks: the next command, or the drain, reports it through the paths that already handle a refused commit. */
	async function landPending({
		topic,
		partition,
		nextOffset,
	}: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): Promise<void> {
		try {
			await commitCommandOffset({ topic, partition, nextOffset });
		} catch (cause) {
			settling.failure = cause;
			if (settling.pending === null || nextOffset > settling.pending)
				settling.pending = nextOffset;
			ctx.logger?.warn?.(
				"Command offsets could not be landed; the next command reports it",
				{ topic, partition, nextOffset: nextOffset.toString(), error: cause },
			);
		} finally {
			settling.inFlight = null;
			if (settling.failure === null && settling.pending !== null)
				scheduleFlush();
		}
	}

	async function flushCommandOffsets(): Promise<void> {
		cancelScheduledFlush();
		await flushPending();
		// Offsets settled while that landing was in flight land now too.
		cancelScheduledFlush();
		await flushPending();
		if (settling.failure !== null) throw settling.failure;
	}

	return {
		appendCommitted,
		commitCommandOffset,
		settleCommandOffset,
		flushCommandOffsets,
		encodedBytesOf,
	};
}

export type CommandOffsetSettleTiming = {
	gapMs: number;
	now(): number;
	/** Runs `run` after `delayMs`; the returned function cancels it. */
	schedule(run: () => void, delayMs: number): () => void;
};

type CommandOffsetSettling = {
	target: { topic: string; partition: number } | null;
	pending: bigint | null;
	landed: bigint | null;
	landedAt: number | null;
	inFlight: Promise<void> | null;
	cancelScheduled: (() => void) | null;
	failure: unknown;
};

function defaultSettleTiming(): CommandOffsetSettleTiming {
	return {
		gapMs: BALANCE_WORKER_COMMAND_OFFSET_SETTLE_GAP_MS,
		now: monotonicNow,
		schedule: scheduleOnTimer,
	};
}

function monotonicNow(): number {
	return performance.now();
}

function scheduleOnTimer(run: () => void, delayMs: number): () => void {
	const timer = setTimeout(run, delayMs);
	timer.unref?.();
	return function cancel(): void {
		clearTimeout(timer);
	};
}
