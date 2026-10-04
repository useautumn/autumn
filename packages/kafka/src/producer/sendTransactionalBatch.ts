import {
	KafkaJSError,
	KafkaJSNumberOfRetriesExceeded,
	KafkaJSProtocolError,
} from "kafkajs";
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
import { compressionFor } from "./compressionFor.js";
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
 * A refusal the broker itself expects to be retried never counts as a failed
 * batch straight away. The coordinator answers CONCURRENT_TRANSACTIONS while it
 * is still finishing the producer's previous transaction; a broker being
 * replaced answers NOT_LEADER_OR_FOLLOWER until leadership has moved; a
 * coordinator on the move answers NOT_COORDINATOR. kafkajs marks all of these
 * retriable and retries a few times itself; when it gives up, nothing of the
 * new transaction has been kept, because the batch is aborted before it is
 * reported here. So the transaction is begun again after a short, fixed wait,
 * for as long as the deadline allows, and only then counts as a batch that did
 * not commit.
 */
export type TransactionRetry = {
	/** How long refusals are waited out before the batch counts as not committed. */
	deadlineMs: number;
	/** Fixed, not doubling: a refusal clears in milliseconds, and a longer wait only adds latency. */
	backoffMs: number;
	sleep(ms: number): Promise<void>;
	now(): number;
};

function sleepFor(ms: number): Promise<void> {
	const wake = Promise.withResolvers<void>();
	setTimeout(wake.resolve, ms);
	return wake.promise;
}

function monotonicNow(): number {
	return performance.now();
}

const DEFAULT_TRANSACTION_RETRY: TransactionRetry = {
	deadlineMs: 5_000,
	backoffMs: 25,
	sleep: sleepFor,
	now: monotonicNow,
};

/** The default retry with a shorter deadline, for a publish whose reader would not wait the full one. */
export function transactionRetryWithin({
	deadlineMs,
}: {
	deadlineMs: number;
}): TransactionRetry {
	return { ...DEFAULT_TRANSACTION_RETRY, deadlineMs };
}

export function isConcurrentTransactionsError(cause: unknown): boolean {
	return (
		cause instanceof KafkaJSProtocolError &&
		cause.type === "CONCURRENT_TRANSACTIONS"
	);
}

/** kafkajs takes retriability from the protocol's error table, and keeps the
 *  original refusal as the cause of the error it throws once its own retries run out. */
export function isRetriableKafkaError(cause: unknown): boolean {
	if (cause instanceof KafkaJSNumberOfRetriesExceeded)
		return isRetriableKafkaError(cause.cause);
	return cause instanceof KafkaJSError && cause.retriable === true;
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
			compression: compressionFor({ records: partitionMessages.length }),
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

/** Waits out any refusal the broker asks to be retried; every other verdict stands. */
async function runTransactionWithRetry<Result>({
	producer,
	send,
	retry,
}: {
	producer: KafkaProducer;
	send(transaction: KafkaTransaction): Promise<Result>;
	retry: TransactionRetry;
}): Promise<Result> {
	const startedAt = retry.now();
	for (;;) {
		try {
			return await runTransaction({ producer, send });
		} catch (cause) {
			const refused =
				cause instanceof KafkaBatchNotCommittedError &&
				isRetriableKafkaError(cause.cause);
			const waitedMs = retry.now() - startedAt;
			if (!refused || waitedMs + retry.backoffMs > retry.deadlineMs)
				throw cause;
		}
		await retry.sleep(retry.backoffMs);
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
