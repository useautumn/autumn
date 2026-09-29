import { BALANCE_WORKER_COMMAND_OFFSET_SETTLE_GAP_MS } from "@autumn/env/balanceWorkerConstants";
import {
	createMeteringPublisher,
	KafkaBatchNotCommittedError,
	type KafkaCommitMode,
	type KafkaOffsetCommit,
	type KafkaProducer,
	type MeteringRecord,
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
		/** The consumer group's own offset commit: lands offsets no batch carries, without a transaction. */
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
		lastLandingAt: null,
		inFlight: null,
		cancelScheduled: null,
		lastFailure: null,
		failing: false,
		closed: false,
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

	/** An offset no batch carries goes through the consumer group's own commit. A transaction of its own
	 *  would take the partition's one transaction slot for three broker trips and refuse the next batch
	 *  that arrives meanwhile; the group commit is one request that contends with nothing. */
	async function commitCommandOffset({
		partition,
		nextOffset,
	}: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): Promise<void> {
		if (!ctx.commandOffsets)
			throw new Error(
				"Command offsets outside a batch need the consumer group's committer",
			);
		await ctx.commandOffsets.commit(offsetsOf({ partition, nextOffset }));
		markLanded({ nextOffset });
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
		settling.lastLandingAt = settle.now();
		settling.failing = false;
		settling.lastFailure = null;
		if (settling.pending !== null && settling.pending <= settling.landed)
			settling.pending = null;
		if (settling.pending === null) cancelScheduledFlush();
	}

	function cancelScheduledFlush(): void {
		const cancel = settling.cancelScheduled;
		settling.cancelScheduled = null;
		if (cancel) cancel();
	}

	/** Never throws: the Postgres bookmark decides where a restart resumes, so a landing that
	 *  fails costs lag telemetry and a retry, never the command. */
	function settleCommandOffset({
		topic,
		partition,
		nextOffset,
	}: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): void {
		if (settling.landed !== null && nextOffset <= settling.landed) return;
		settling.target = { topic, partition };
		if (settling.pending === null || nextOffset > settling.pending)
			settling.pending = nextOffset;
		scheduleFlush();
	}

	/** One landing at a time, and never within the gap of the last attempt: whatever settles meanwhile joins the next. */
	function scheduleFlush(): void {
		if (settling.closed || settling.inFlight || settling.cancelScheduled)
			return;
		const sinceLastLanding =
			settling.lastLandingAt === null
				? settle.gapMs
				: settle.now() - settling.lastLandingAt;
		const delayMs = Math.max(0, settle.gapMs - sinceLastLanding);
		settling.cancelScheduled = settle.schedule(runScheduledFlush, delayMs);
	}

	function runScheduledFlush(): void {
		settling.cancelScheduled = null;
		void flushPending();
	}

	/** Resolves true once nothing is left waiting; false when the landing it ran was refused. */
	function flushPending(): Promise<boolean> {
		if (settling.inFlight) return settling.inFlight;
		const target = settling.target;
		const nextOffset = settling.pending;
		if (target === null || nextOffset === null) return Promise.resolve(true);
		if (settling.landed !== null && nextOffset <= settling.landed) {
			settling.pending = null;
			return Promise.resolve(true);
		}
		settling.pending = null;
		settling.inFlight = landPending({ ...target, nextOffset });
		return settling.inFlight;
	}

	/** A refused landing keeps the offset waiting for the next batch or the next gap; it is warned once per streak. */
	async function landPending({
		topic,
		partition,
		nextOffset,
	}: {
		topic: string;
		partition: number;
		nextOffset: bigint;
	}): Promise<boolean> {
		try {
			await commitCommandOffset({ topic, partition, nextOffset });
			return true;
		} catch (cause) {
			settling.lastLandingAt = settle.now();
			settling.lastFailure = cause;
			if (settling.pending === null || nextOffset > settling.pending)
				settling.pending = nextOffset;
			if (!settling.failing) {
				settling.failing = true;
				ctx.logger?.warn?.(
					"Command offsets could not be landed; retrying after the gap",
					{ topic, partition, nextOffset: nextOffset.toString(), error: cause },
				);
			}
			return false;
		} finally {
			settling.inFlight = null;
			if (settling.pending !== null) scheduleFlush();
		}
	}

	/** The drain's last word: lands what is waiting now, and nothing is scheduled after it. */
	async function flushCommandOffsets(): Promise<void> {
		settling.closed = true;
		cancelScheduledFlush();
		if (!(await flushPending())) throw settling.lastFailure;
		// Offsets settled while that landing was in flight land now too.
		cancelScheduledFlush();
		if (!(await flushPending())) throw settling.lastFailure;
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
	/** When the last landing finished, whether it landed or was refused. */
	lastLandingAt: number | null;
	inFlight: Promise<boolean> | null;
	cancelScheduled: (() => void) | null;
	lastFailure: unknown;
	failing: boolean;
	/** Set by the drain: nothing is scheduled after it. */
	closed: boolean;
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
