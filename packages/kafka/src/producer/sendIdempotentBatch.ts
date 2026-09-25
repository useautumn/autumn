import { CompressionTypes, KafkaJSProtocolError } from "kafkajs";
import {
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "../client/kafkaErrors.js";
import { metadataToBaseOffset } from "../client/kafkaOffsetUtils.js";
import type { KafkaSender } from "../client/types/kafkaClient.js";
import { assertNonEmpty } from "../lib/assert.js";

/** The record header that names the ownership epoch a batch was written under. */
export const OWNER_EPOCH_HEADER = "ownerEpoch";

/**
 * One broker round trip per commit: the batch goes out with acks=all on an
 * idempotent producer and the leader's acknowledgement is the commit. A
 * batch to one partition is appended atomically whether or not a
 * transaction wraps it, and the producer's sequence numbers drop a retried
 * send the broker already has. What a transaction added was a fence on a
 * stale owner; here the owner's epoch travels in a header instead, for
 * readers to judge by.
 *
 * A broker refusal (a protocol error on the produce response) means nothing
 * was appended. Any other failure, a timeout or a lost connection after the
 * retries, leaves the batch's fate unknown, which the caller treats exactly
 * like an unknown transaction commit.
 */
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
