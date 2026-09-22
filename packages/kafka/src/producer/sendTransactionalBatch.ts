import { CompressionTypes } from "kafkajs";
import {
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "../client/kafkaErrors.js";
import { metadataToBaseOffset } from "../client/kafkaOffsetUtils.js";
import type {
	KafkaOffsetCommit,
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
	offsets,
}: {
	producer: KafkaProducer;
	offsets?: KafkaOffsetCommit;
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

	async function send(
		transaction: KafkaTransaction,
	): Promise<{ baseOffset: bigint }> {
		const partitionMessages = messages.map((message) => ({
			...message,
			partition,
		}));
		const metadata = await transaction.send({
			topic,
			messages: partitionMessages,
			acks: -1,
			compression: CompressionTypes.GZIP,
		});
		const baseOffset = metadataToBaseOffset({ metadata, topic, partition });
		if (offsets) await transaction.sendOffsets(offsets);
		return { baseOffset };
	}
	return runTransaction({ producer, send });
}

/** An offset-only transaction still uses the partition's fenced producer session. */
export async function sendTransactionalOffsets({
	producer,
	offsets,
}: {
	producer: KafkaProducer;
	offsets: KafkaOffsetCommit;
}): Promise<void> {
	return runTransaction({
		producer,
		send: (transaction) => transaction.sendOffsets(offsets),
	});
}

async function runTransaction<Result>({
	producer,
	send,
}: {
	producer: KafkaProducer;
	send(transaction: KafkaTransaction): Promise<Result>;
}): Promise<Result> {
	let transaction: KafkaTransaction;
	try {
		transaction = await producer.transaction();
	} catch (cause) {
		throw new KafkaBatchNotCommittedError({ cause });
	}
	let result: Result;
	try {
		result = await send(transaction);
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
	return result;
}
