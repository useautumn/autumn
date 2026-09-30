import {
	BALANCE_WORKER_LOG_END_SETTLE_ATTEMPTS,
	BALANCE_WORKER_LOG_END_SETTLE_DELAY_MS,
} from "@autumn/env/balanceWorkerConstants";
import { type PartitionPosition, readPartitionLogRange } from "@autumn/kafka";
import { sleepWithSignal } from "../../../runtime/bootstrap/read/loadPartitionCheckpoint.js";
import type { PartitionLogRange } from "../../../runtime/bootstrap/types/partitionBootstrap.js";
import type { RuntimeUnavailableListener } from "../../../runtime/types/partitionRuntime.js";
import { PartitionProgressNotFoundError } from "../../../state/stateStoreErrors.js";
import { StateAheadOfKafkaLogEndError } from "../meteringErrors.js";
import type {
	PartitionReplayContext,
	PartitionReplayState,
} from "../types/partitionReplay.js";
import { readReplayFloor } from "./readReplayFloor.js";

export async function readReplayLogRange({
	ctx,
	state,
	topic,
	partition,
	signal,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
	topic: string;
	partition: number;
	signal: AbortSignal;
}): Promise<PartitionLogRange> {
	validateReplayPosition({ topic, partition });
	if (signal.aborted) throw signal.reason;
	const range = await readPartitionLogRange({
		ctx: { partitionOffsets: ctx.partitionOffsets },
		topic,
		partition,
	});
	if (signal.aborted) throw signal.reason;
	ctx.positionTracker.observeHighWatermark({
		topic,
		partition,
		highWatermark: range.logEndOffset,
	});
	state.lastLogRange = range;
	return range;
}

export async function startReplay({
	ctx,
	state,
	topic,
	partition,
	targetNextOffset,
	onUnavailable,
	fromBookmark = false,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
	topic: string;
	partition: number;
	targetNextOffset: bigint;
	onUnavailable: RuntimeUnavailableListener;
	fromBookmark?: boolean;
}): Promise<void> {
	if (state.status !== "created")
		throw new Error(
			`Kafka partition follower cannot start while ${state.status}`,
		);
	validateReplayPosition({ topic, partition });
	if (
		topic !== state.position.topic ||
		partition !== state.position.partition
	) {
		throw new Error(
			`Kafka partition follower ${topic}[${partition}] does not match its assigned partition ${state.position.topic}[${state.position.partition}]`,
		);
	}
	if (targetNextOffset < 0n)
		throw new RangeError(`Invalid target next offset: ${targetNextOffset}`);
	state.status = "starting";
	state.position = { topic, partition };
	state.onUnavailable = onUnavailable;
	state.abortController = new AbortController();
	state.startPromise = catchUpPartition({
		ctx,
		state,
		targetNextOffset,
		fromBookmark,
		signal: state.abortController.signal,
	});
	return state.startPromise;
}

async function catchUpPartition({
	ctx,
	state,
	targetNextOffset,
	fromBookmark,
	signal,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
	targetNextOffset: bigint;
	fromBookmark: boolean;
	signal: AbortSignal;
}): Promise<void> {
	const { topic, partition } = state.position;
	const storedNextOffset = ctx.stateStore.readNextOffset({ topic, partition });
	if (storedNextOffset === null)
		throw new PartitionProgressNotFoundError({ topic, partition });
	const catchUpTarget =
		storedNextOffset > targetNextOffset
			? await settleLogEnd({
					ctx,
					state,
					storedNextOffset,
					staleLogEndOffset: targetNextOffset,
					signal,
				})
			: targetNextOffset;
	const floor = fromBookmark
		? storedNextOffset
		: await readReplayFloor({ ctx, state, bookmark: storedNextOffset });
	if (signal.aborted) throw signal.reason;
	// A new replay must rebuild recent commands even if an earlier runtime reached the target.
	ctx.positionTracker.reset({ topic, partition, nextOffset: floor });
	if (floor < storedNextOffset)
		ctx.replayFloorByPartition.set(partition, floor);
	try {
		// Resume, seek and fetch back to back: nothing may be fetched from the old group offset in between.
		ctx.consumption.resumePartition({ partition });
		ctx.consumption.seekPartition({ partition, nextOffset: floor });
		ctx.consumption.resumeFetching({ partition });
		await ctx.positionTracker.waitUntil({
			topic,
			partition,
			nextOffset: catchUpTarget,
			signal,
		});
	} finally {
		ctx.replayFloorByPartition.delete(partition);
	}
	if (signal.aborted) throw signal.reason;
	state.status = "following";
}

/** The state was hydrated from a bookmark the owner wrote after the log end was read, so the
 *  owner's latest record is usually one high-watermark update away. The log end is re-read
 *  until it reaches the stored offset; state that stays ahead is a real divergence. */
async function settleLogEnd({
	ctx,
	state,
	storedNextOffset,
	staleLogEndOffset,
	signal,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
	storedNextOffset: bigint;
	staleLogEndOffset: bigint;
	signal: AbortSignal;
}): Promise<bigint> {
	const { topic, partition } = state.position;
	const { attempts, delayMs } = ctx.logEndSettle ?? {
		attempts: BALANCE_WORKER_LOG_END_SETTLE_ATTEMPTS,
		delayMs: BALANCE_WORKER_LOG_END_SETTLE_DELAY_MS,
	};
	let logEndOffset = staleLogEndOffset;
	let attempt = 0;
	while (attempt < attempts) {
		attempt += 1;
		await sleepWithSignal({ delayMs, signal });
		const range = await readReplayLogRange({
			ctx,
			state,
			topic,
			partition,
			signal,
		});
		logEndOffset = range.logEndOffset;
		if (logEndOffset < storedNextOffset) continue;
		ctx.logger?.warn(
			{
				event: "balance_worker.log_end_settled",
				data: {
					topic,
					partition,
					storedNextOffset: storedNextOffset.toString(),
					staleLogEndOffset: staleLogEndOffset.toString(),
					logEndOffset: logEndOffset.toString(),
					attempt,
				},
			},
			`Kafka log end for ${topic}[${partition}] caught up with stored state after ${attempt} re-read(s)`,
		);
		return logEndOffset;
	}
	throw new StateAheadOfKafkaLogEndError({
		topic,
		partition,
		storedNextOffset,
		logEndOffset,
	});
}

function validateReplayPosition({ topic, partition }: PartitionPosition): void {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(partition) || partition < 0)
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
}
