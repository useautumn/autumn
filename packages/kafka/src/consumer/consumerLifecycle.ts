import type { ConsumerEndBatchProcessEvent, EachBatchPayload } from "kafkajs";
import { parseKafkaOffset } from "../client/kafkaOffsetUtils.js";
import { consumeBatch } from "./consumeBatch.js";
import type {
	TopicConsumerContext,
	TopicConsumerState,
} from "./types/consumer.js";

export async function startConsumer({
	ctx,
	state,
}: {
	ctx: TopicConsumerContext;
	state: TopicConsumerState;
}): Promise<void> {
	if (state.isStarted) throw new Error("Kafka topic consumer already started");
	if (state.isStopped) throw new Error("Kafka topic consumer already stopped");

	function onGroupJoin(): void {
		state.initializedPartitions.clear();
	}

	function eachBatch(payload: EachBatchPayload): Promise<void> {
		return consumeBatch({ ctx, state, payload });
	}

	function onBatchProcessed(event: ConsumerEndBatchProcessEvent): void {
		observeBatchProgress({ ctx, state, event });
	}

	await ctx.consumer.connect();
	state.removeGroupJoinListener = ctx.consumer.on(
		ctx.consumer.events.GROUP_JOIN,
		onGroupJoin,
	);
	state.removeEndBatchProcessListener = ctx.consumer.on(
		ctx.consumer.events.END_BATCH_PROCESS,
		onBatchProcessed,
	);
	try {
		await ctx.consumer.subscribe({
			topics: [ctx.config.topic],
			fromBeginning: true,
		});
		await ctx.consumer.run({
			autoCommit: false,
			eachBatchAutoResolve: false,
			partitionsConsumedConcurrently:
				ctx.config.partitionsConsumedConcurrently ?? 1,
			eachBatch,
		});
		state.isStarted = true;
	} catch (cause) {
		try {
			await ctx.consumer.disconnect();
		} catch {
			// Preserve the startup failure if disconnect also fails.
		} finally {
			removeConsumerListeners({ state });
		}
		throw cause;
	}
}

function observeBatchProgress({
	ctx,
	state,
	event,
}: {
	ctx: TopicConsumerContext;
	state: TopicConsumerState;
	event: ConsumerEndBatchProcessEvent;
}): void {
	const { payload } = event;
	if (
		payload.topic !== ctx.config.topic ||
		state.withdrawnPartitions.has(payload.partition)
	)
		return;
	ctx.progress.observeHighWatermark({
		topic: payload.topic,
		partition: payload.partition,
		highWatermark: parseKafkaOffset({ offset: payload.highWatermark }),
	});
	if (payload.batchSize !== 0) return;
	// Filtered records and transaction markers also count toward catch-up.
	ctx.progress.advance({
		topic: payload.topic,
		partition: payload.partition,
		nextOffset: parseKafkaOffset({ offset: payload.lastOffset }) + 1n,
	});
}

export async function stopConsumer({
	ctx,
	state,
}: {
	ctx: TopicConsumerContext;
	state: TopicConsumerState;
}): Promise<void> {
	if (!state.isStarted || state.isStopped) return;
	state.isStopped = true;
	try {
		await ctx.consumer.stop();
	} finally {
		try {
			await ctx.consumer.disconnect();
		} finally {
			removeConsumerListeners({ state });
		}
	}
}

export function removeConsumerListeners({
	state,
}: {
	state: TopicConsumerState;
}): void {
	state.removeGroupJoinListener?.();
	state.removeGroupJoinListener = null;
	state.removeEndBatchProcessListener?.();
	state.removeEndBatchProcessListener = null;
}
