import { CompressionTypes, KafkaJSProtocolError } from "kafkajs";
import {
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "../client/kafkaErrors.js";
import { metadataToBaseOffset } from "../client/kafkaOffsetUtils.js";
import type { KafkaSender } from "../client/types/kafkaClient.js";
import { assertNonEmpty } from "../lib/assert.js";

export const OWNER_EPOCH_HEADER = "ownerEpoch";

export async function sendIdempotentBatch({
	sender,
	topic,
	partition,
	messages,
	ownerEpoch,
}: {
	sender: KafkaSender;
	topic: string;
	partition: number;
	messages: ReadonlyArray<{ key: Buffer; value: Buffer }>;
	ownerEpoch?: string;
}): Promise<{ baseOffset: bigint }> {
	assertNonEmpty({ name: "topic", value: topic });
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	if (messages.length === 0) {
		throw new RangeError("Kafka batch cannot be empty");
	}
	const headers =
		ownerEpoch === undefined ? undefined : { [OWNER_EPOCH_HEADER]: ownerEpoch };
	const partitionMessages: {
		key: Buffer;
		value: Buffer;
		partition: number;
		headers?: Record<string, string>;
	}[] = [];
	for (const message of messages) {
		partitionMessages.push(
			headers ? { ...message, partition, headers } : { ...message, partition },
		);
	}
	let metadata: Awaited<ReturnType<KafkaSender["send"]>>;
	try {
		metadata = await sender.send({
			topic,
			messages: partitionMessages,
			acks: -1,
			compression: CompressionTypes.GZIP,
		});
	} catch (cause) {
		if (cause instanceof KafkaJSProtocolError) {
			throw new KafkaBatchNotCommittedError({ cause });
		}
		throw new KafkaTransactionStateUnknownError({
			failureStage: "commit",
			cause,
		});
	}
	return { baseOffset: metadataToBaseOffset({ metadata, topic, partition }) };
}
