import type { Admin } from "kafkajs";
import { parseKafkaOffset } from "../client/kafkaOffsetUtils.js";
import { KafkaPartitionOffsetsNotFoundError } from "./consumerErrors.js";
import type { PartitionLogRange } from "./types/progress.js";

export async function readTopicHighWatermarks({
	ctx,
	topic,
}: {
	ctx: { partitionOffsets: Pick<Admin, "fetchTopicOffsets"> };
	topic: string;
}): Promise<ReadonlyMap<number, bigint>> {
	const offsets = await ctx.partitionOffsets.fetchTopicOffsets(topic);
	const highWatermarks = new Map<number, bigint>();
	for (const range of offsets) {
		highWatermarks.set(
			range.partition,
			parseKafkaOffset({ offset: range.high }),
		);
	}
	return highWatermarks;
}

export async function readPartitionLogRange({
	ctx,
	topic,
	partition,
}: {
	ctx: { partitionOffsets: Pick<Admin, "fetchTopicOffsets"> };
	topic: string;
	partition: number;
}): Promise<PartitionLogRange> {
	const offsets = await ctx.partitionOffsets.fetchTopicOffsets(topic);
	for (const range of offsets) {
		if (range.partition !== partition) continue;
		return {
			logStartOffset: parseKafkaOffset({ offset: range.low }),
			logEndOffset: parseKafkaOffset({ offset: range.high }),
		};
	}
	throw new KafkaPartitionOffsetsNotFoundError({ topic, partition });
}
