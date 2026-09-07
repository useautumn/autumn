import {
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "../client/kafkaErrors.js";
import { metadataToBaseOffset } from "../client/kafkaOffsetUtils.js";
import type {
	KafkaProducer,
	KafkaTransaction,
} from "../client/types/kafkaClient.js";
import { assertNonEmpty } from "../lib/assert.js";

async function abortTransaction({
	transaction,
	cause,
}: {
	transaction: KafkaTransaction;
	cause: unknown;
}): Promise<never> {
	try {
		await transaction.abort();
	} catch (abortCause) {
		throw new KafkaTransactionStateUnknownError({
			failureStage: "abort",
			cause,
			abortCause,
		});
	}
	throw new KafkaBatchNotCommittedError({ cause });
}

export async function sendTransactionalBatch({
	producer,
	topic,
	partition,
	messages,
}: {
	producer: KafkaProducer;
	topic: string;
	partition: number;
	messages: ReadonlyArray<{ key: Buffer; value: Buffer }>;
}): Promise<{ baseOffset: bigint }> {
	assertNonEmpty({ name: "topic", value: topic });
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	if (messages.length === 0) {
		throw new RangeError("Kafka batch cannot be empty");
	}

	let transaction: KafkaTransaction;
	try {
		transaction = await producer.transaction();
	} catch (cause) {
		throw new KafkaBatchNotCommittedError({ cause });
	}

	let baseOffset: bigint;
	try {
		const partitionMessages = [];
		for (const message of messages) {
			partitionMessages.push({ ...message, partition });
		}
		const metadata = await transaction.send({
			topic,
			messages: partitionMessages,
			acks: -1,
		});
		baseOffset = metadataToBaseOffset({ metadata, topic, partition });
	} catch (cause) {
		return abortTransaction({ transaction, cause });
	}

	try {
		await transaction.commit();
	} catch (cause) {
		throw new KafkaTransactionStateUnknownError({
			failureStage: "commit",
			cause,
		});
	}

	return { baseOffset };
}
