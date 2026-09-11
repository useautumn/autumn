import type { EachBatchPayload } from "kafkajs";
import { parseKafkaOffset } from "../client/kafkaOffsetUtils.js";
import type {
	TopicBatchParams,
	TopicConsumerContext,
	TopicConsumerState,
} from "./types/consumer.js";

export function hasCurrentBatchGeneration({
	state,
	payload,
	generation,
}: {
	state: TopicConsumerState;
	payload: EachBatchPayload;
	generation: number;
}): boolean {
	return (
		!payload.isStale() &&
		(state.partitionGenerations.get(payload.batch.partition) ?? 0) ===
			generation
	);
}

export async function reconcilePartitionOffset({
	ctx,
	state,
	payload,
	generation,
	nextOffset,
}: {
	ctx: TopicConsumerContext;
	state: TopicConsumerState;
	payload: EachBatchPayload;
	generation: number;
	nextOffset: bigint;
}): Promise<void> {
	const { topic, partition } = payload.batch;
	if (!hasCurrentBatchGeneration({ state, payload, generation })) return;
	await ctx.consumer.commitOffsets([
		{ topic, partition, offset: nextOffset.toString() },
	]);
	if (!hasCurrentBatchGeneration({ state, payload, generation })) return;
	ctx.consumer.seek({ topic, partition, offset: nextOffset.toString() });
	ctx.progress.advance({ topic, partition, nextOffset });
	state.initializedPartitions.add(JSON.stringify([topic, partition]));
}

export async function commitBatchOffsets({
	ctx,
	state,
	payload,
	generation,
}: TopicBatchParams): Promise<void> {
	const { topic, partition } = payload.batch;
	if (
		!payload.isRunning() ||
		!hasCurrentBatchGeneration({ state, payload, generation })
	)
		return;
	const offset = readPendingOffset(payload);
	if (offset !== null) {
		await payload.commitOffsetsIfNecessary({
			topics: [{ topic, partitions: [{ partition, offset }] }],
		});
	}
	if (
		!payload.isRunning() ||
		!hasCurrentBatchGeneration({ state, payload, generation })
	)
		return;
	const fetchedNextOffset =
		parseKafkaOffset({ offset: payload.batch.lastOffset() }) + 1n;
	const committedNextOffset =
		offset === null ? fetchedNextOffset : parseKafkaOffset({ offset });
	ctx.progress.advance({
		topic,
		partition,
		nextOffset:
			fetchedNextOffset > committedNextOffset
				? fetchedNextOffset
				: committedNextOffset,
	});
	state.initializedPartitions.add(JSON.stringify([topic, partition]));
}

function readPendingOffset(payload: EachBatchPayload): string | null {
	const { topic, partition } = payload.batch;
	for (const pendingTopic of payload.uncommittedOffsets().topics) {
		if (pendingTopic.topic !== topic) continue;
		for (const pendingPartition of pendingTopic.partitions) {
			if (Number(pendingPartition.partition) === partition)
				return pendingPartition.offset;
		}
	}
	// KafkaJS omits resolved offsets that already match the group's committed offset.
	return null;
}
