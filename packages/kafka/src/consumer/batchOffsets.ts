import type { EachBatchPayload } from "kafkajs";
import { parseKafkaOffset } from "../client/kafkaOffsetUtils.js";
import { KafkaPartitionOffsetsNotFoundError } from "./consumerErrors.js";
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
	await payload.commitOffsetsIfNecessary({
		topics: [{ topic, partitions: [{ partition, offset }] }],
	});
	if (
		!payload.isRunning() ||
		!hasCurrentBatchGeneration({ state, payload, generation })
	)
		return;
	const committedNextOffset = parseKafkaOffset({ offset });
	const fetchedNextOffset =
		parseKafkaOffset({ offset: payload.batch.lastOffset() }) + 1n;
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

function readPendingOffset(payload: EachBatchPayload): string {
	const { topic, partition } = payload.batch;
	for (const pendingTopic of payload.uncommittedOffsets().topics) {
		if (pendingTopic.topic !== topic) continue;
		for (const pendingPartition of pendingTopic.partitions) {
			if (Number(pendingPartition.partition) === partition)
				return pendingPartition.offset;
		}
	}
	throw new KafkaPartitionOffsetsNotFoundError({ topic, partition });
}
