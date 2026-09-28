import { CompressionTypes, KafkaJSProtocolError } from "kafkajs";
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
import { sendIdempotentBatch } from "./sendIdempotentBatch.js";

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

/**
 * The coordinator answers CONCURRENT_TRANSACTIONS while it is still finishing
 * the producer's previous transaction; the protocol lists it as final but the
 * broker expects a retry (kafkajs marks it retriable for that reason). Nothing
 * of the new transaction has been appended when it arrives, so it is aborted
 * and begun again after a short wait, a few times, before it counts as a batch
 * that did not commit.
 */
export type TransactionRetry = {
	attempts: number;
	initialBackoffMs: number;
	sleep(ms: number): Promise<void>;
};

function sleepFor(ms: number): Promise<void> {
	const wake = Promise.withResolvers<void>();
	setTimeout(wake.resolve, ms);
	return wake.promise;
}

const DEFAULT_TRANSACTION_RETRY: TransactionRetry = {
	attempts: 6,
	initialBackoffMs: 25,
	sleep: sleepFor,
};

export function isConcurrentTransactionsError(cause: unknown): boolean {
	return (
		cause instanceof KafkaJSProtocolError &&
		cause.type === "CONCURRENT_TRANSACTIONS"
	);
}

export async function sendTransactionalBatch({
	producer,
	topic,
	partition,
	messages,
	offsets,
	retry = DEFAULT_TRANSACTION_RETRY,
}: {
	producer: KafkaProducer;
	offsets?: KafkaOffsetCommit;
	topic: string;
	partition: number;
	messages: ReadonlyArray<{ key: Buffer; value: Buffer }>;
	retry?: TransactionRetry;
}): Promise<{ baseOffset: bigint }> {
	assertNonEmpty({ name: "topic", value: topic });
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	if (messages.length === 0) {
		throw new RangeError("Kafka batch cannot be empty");
	}
	// An idempotent session has no transactions: the same batch goes out as one plain produce.
	// Offsets cannot ride along; a caller that commits them branches before reaching here.
	if (producer.mode === "idempotent") {
		if (offsets) {
			throw new Error(
				"An idempotent producer commits offsets through the consumer group, not in a batch",
			);
		}
		if (!producer.send)
			throw new Error("Idempotent batches need a producer with a plain send");
		return sendIdempotentBatch({
			sender: { send: producer.send },
			topic,
			partition,
			messages,
		});
	}

	async function send(
		transaction: KafkaTransaction,
	): Promise<{ baseOffset: bigint }> {
		const partitionMessages: {
			key: Buffer;
			value: Buffer;
			partition: number;
		}[] = [];
		for (const message of messages)
			partitionMessages.push({ ...message, partition });
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

	return runTransactionWithRetry({ producer, send, retry });
}

/** An offset-only transaction still uses the partition's fenced producer session. */
export async function sendTransactionalOffsets({
	producer,
	offsets,
	retry = DEFAULT_TRANSACTION_RETRY,
}: {
	producer: KafkaProducer;
	offsets: KafkaOffsetCommit;
	retry?: TransactionRetry;
}): Promise<void> {
	if (producer.mode === "idempotent") {
		throw new Error(
			"An idempotent producer commits offsets through the consumer group, not in a transaction",
		);
	}
	function send(transaction: KafkaTransaction): Promise<void> {
		return transaction.sendOffsets(offsets);
	}
	return runTransactionWithRetry({ producer, send, retry });
}

/** Retries only the refusal the coordinator asks to be retried; anything else keeps its verdict. */
async function runTransactionWithRetry<Result>({
	producer,
	send,
	retry,
}: {
	producer: KafkaProducer;
	send(transaction: KafkaTransaction): Promise<Result>;
	retry: TransactionRetry;
}): Promise<Result> {
	let backoffMs = retry.initialBackoffMs;
	for (let attempt = 1; ; attempt++) {
		try {
			return await runTransaction({ producer, send });
		} catch (cause) {
			const refusedConcurrent =
				cause instanceof KafkaBatchNotCommittedError &&
				isConcurrentTransactionsError(cause.cause);
			if (!refusedConcurrent || attempt >= retry.attempts) throw cause;
		}
		await retry.sleep(backoffMs);
		backoffMs *= 2;
	}
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
