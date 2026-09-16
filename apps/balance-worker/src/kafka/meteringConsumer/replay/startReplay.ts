import { readPartitionLogRange } from "@autumn/kafka";
import type { RuntimeUnavailableListener } from "../../../runtime/types/partitionRuntime.js";
import { PartitionProgressNotFoundError } from "../../../state/sqliteBalanceStateErrors.js";
import {
	StateAheadOfKafkaLogEndError,
	StateBehindKafkaLogStartError,
} from "../meteringErrors.js";
import type {
	PartitionReplayContext,
	PartitionReplayState,
} from "../types/partitionReplay.js";

export async function startReplay({
	ctx,
	state,
	topic,
	partition,
	onUnavailable,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
	topic: string;
	partition: number;
	onUnavailable: RuntimeUnavailableListener;
}): Promise<void> {
	if (state.status !== "created")
		throw new Error(
			`Kafka partition follower cannot start while ${state.status}`,
		);
	if (!topic.trim()) throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(partition) || partition < 0)
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	state.status = "starting";
	state.position = { topic, partition };
	state.onUnavailable = onUnavailable;
	state.abortController = new AbortController();
	state.startPromise = catchUpPartition({
		ctx,
		state,
		topic,
		partition,
		signal: state.abortController.signal,
	});
	return state.startPromise;
}
async function catchUpPartition({
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
}): Promise<void> {
	const storedNextOffset = ctx.stateStore.readNextOffset({ topic, partition });
	if (storedNextOffset === null)
		throw new PartitionProgressNotFoundError({ topic, partition });
	const { logStartOffset, logEndOffset } = await readPartitionLogRange({
		ctx,
		topic,
		partition,
	});
	if (signal.aborted) throw signal.reason;
	if (storedNextOffset < logStartOffset) {
		throw new StateBehindKafkaLogStartError({
			topic,
			partition,
			storedNextOffset,
			logStartOffset,
		});
	}
	if (storedNextOffset > logEndOffset) {
		throw new StateAheadOfKafkaLogEndError({
			topic,
			partition,
			storedNextOffset,
			logEndOffset,
		});
	}
	ctx.positionTracker.advance({
		topic,
		partition,
		nextOffset: storedNextOffset,
	});
	ctx.consumption.resumePartition({ partition });
	ctx.consumption.seekPartition({ partition, nextOffset: storedNextOffset });
	ctx.consumption.resumeFetching({ partition });
	await ctx.positionTracker.waitUntil({
		topic,
		partition,
		nextOffset: logEndOffset,
		signal,
	});
	if (signal.aborted) throw signal.reason;
	state.status = "following";
}
