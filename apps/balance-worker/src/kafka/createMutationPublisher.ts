import {
	createMeteringPublisher,
	KafkaBatchNotCommittedError,
	type KafkaProducer,
	type MeteringRecord,
	sendTransactionalOffsets,
	serializeMeteringRecord,
} from "@autumn/kafka";
import type { CommittedOutcomeAppender } from "../processor/writer/types/partitionWriter.js";
import { MutationBatchNotCommittedError } from "../processor/writer/writerErrors.js";
import { translateKafkaProducerError } from "./workerKafkaErrors.js";

export function createMutationPublisher({
	ctx,
	config,
}: {
	ctx: { producer: KafkaProducer };
	config?: { commandTopic: string; groupId: string };
}): Required<CommittedOutcomeAppender> {
	const publisher = createMeteringPublisher({ ctx });

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
			const offsets =
				commandNextOffset !== undefined
					? offsetsOf({ partition, nextOffset: commandNextOffset })
					: undefined;
			return await publisher.append({
				topic,
				partition,
				records: outcomes,
				offsets,
			});
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
		const { key, value } = serializeMeteringRecord({ record });
		return key.length + value.length;
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
			await sendTransactionalOffsets({
				producer: ctx.producer,
				offsets: offsetsOf({ partition, nextOffset }),
			});
		} catch (cause) {
			throw translateKafkaProducerError({ topic, partition, cause });
		}
	}

	return { appendCommitted, commitCommandOffset, encodedBytesOf };
}
