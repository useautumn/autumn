import { type PartitionPosition, readPartitionLogRange } from "@autumn/kafka";
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
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
	topic: string;
	partition: number;
	targetNextOffset: bigint;
	onUnavailable: RuntimeUnavailableListener;
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
		signal: state.abortController.signal,
	});
	return state.startPromise;
}

async function catchUpPartition({
	ctx,
	state,
	targetNextOffset,
	signal,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
	targetNextOffset: bigint;
	signal: AbortSignal;
}): Promise<void> {
	const { topic, partition } = state.position;
	const storedNextOffset = ctx.stateStore.readNextOffset({ topic, partition });
	if (storedNextOffset === null)
		throw new PartitionProgressNotFoundError({ topic, partition });
	if (storedNextOffset > targetNextOffset) {
		throw new StateAheadOfKafkaLogEndError({
			topic,
			partition,
			storedNextOffset,
			logEndOffset: targetNextOffset,
		});
	}
	// Readiness still means the bookmark reached log end; the records below it only refill recent commands.
	ctx.positionTracker.advance({
		topic,
		partition,
		nextOffset: storedNextOffset,
	});
	const floor = await readReplayFloor({
		ctx,
		state,
		bookmark: storedNextOffset,
	});
	if (signal.aborted) throw signal.reason;
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
			nextOffset: targetNextOffset,
			signal,
		});
	} finally {
		ctx.replayFloorByPartition.delete(partition);
	}
	if (signal.aborted) throw signal.reason;
	state.status = "following";
}

function validateReplayPosition({ topic, partition }: PartitionPosition): void {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(partition) || partition < 0)
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
}
