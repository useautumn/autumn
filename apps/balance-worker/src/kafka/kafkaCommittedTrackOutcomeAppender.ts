import type { RecordMetadata, Transaction } from "kafkajs";
import {
	type CommittedTrackOutcomeAppender,
	TrackOutcomeBatchNotCommittedError,
} from "../writer/committedTrackOutcomeAppender.js";
import { serializeKafkaTrackOutcomeRecord } from "./trackOutcomeRecord.js";

export type KafkaTrackOutcomeTransactionPort = Pick<
	Transaction,
	"send" | "commit" | "abort"
>;

export type KafkaTrackOutcomeProducerPort = {
	transaction(): Promise<KafkaTrackOutcomeTransactionPort>;
};

export class KafkaTrackOutcomeTransactionStateUnknownError extends Error {
	readonly failureStage: "abort" | "commit";
	readonly abortCause?: unknown;

	constructor({
		failureStage,
		cause,
		abortCause,
	}: {
		failureStage: "abort" | "commit";
		cause: unknown;
		abortCause?: unknown;
	}) {
		super("Kafka track outcome transaction state is unknown", { cause });
		this.name = "KafkaTrackOutcomeTransactionStateUnknownError";
		this.failureStage = failureStage;
		this.abortCause = abortCause;
	}
}

const parseBaseOffset = ({
	metadata,
	topic,
	partition,
}: {
	metadata: RecordMetadata[];
	topic: string;
	partition: number;
}): bigint => {
	if (metadata.length !== 1) {
		throw new Error("Expected Kafka metadata for one topic partition");
	}

	const recordMetadata = metadata[0];
	if (
		!recordMetadata ||
		recordMetadata.topicName !== topic ||
		recordMetadata.partition !== partition ||
		recordMetadata.errorCode !== 0
	) {
		throw new Error(
			"Kafka metadata did not match the appended topic partition",
		);
	}

	const offset = recordMetadata.baseOffset ?? recordMetadata.offset;
	if (typeof offset !== "string" || !/^(0|[1-9]\d*)$/.test(offset)) {
		throw new Error("Kafka metadata did not contain a valid base offset");
	}
	return BigInt(offset);
};

const abortTransaction = async ({
	transaction,
	cause,
}: {
	transaction: KafkaTrackOutcomeTransactionPort;
	cause: unknown;
}): Promise<never> => {
	try {
		await transaction.abort();
	} catch (abortCause) {
		throw new KafkaTrackOutcomeTransactionStateUnknownError({
			failureStage: "abort",
			cause,
			abortCause,
		});
	}
	throw new TrackOutcomeBatchNotCommittedError({ cause });
};

export const createKafkaCommittedTrackOutcomeAppender = ({
	producer,
}: {
	producer: KafkaTrackOutcomeProducerPort;
}): CommittedTrackOutcomeAppender => ({
	appendCommitted: async ({ topic, partition, outcomes }) => {
		if (topic.trim().length === 0)
			throw new Error("Kafka topic cannot be empty");
		if (!Number.isSafeInteger(partition) || partition < 0) {
			throw new RangeError(`Invalid Kafka partition: ${partition}`);
		}
		if (outcomes.length === 0) {
			throw new RangeError("Track outcome batch cannot be empty");
		}

		const messages = outcomes.map((outcome) => ({
			...serializeKafkaTrackOutcomeRecord({ outcome }),
			partition,
		}));

		let transaction: KafkaTrackOutcomeTransactionPort;
		try {
			transaction = await producer.transaction();
		} catch (cause) {
			throw new TrackOutcomeBatchNotCommittedError({ cause });
		}

		let baseOffset: bigint;
		try {
			const metadata = await transaction.send({ topic, messages, acks: -1 });
			baseOffset = parseBaseOffset({ metadata, topic, partition });
		} catch (cause) {
			return abortTransaction({ transaction, cause });
		}

		try {
			await transaction.commit();
		} catch (cause) {
			throw new KafkaTrackOutcomeTransactionStateUnknownError({
				failureStage: "commit",
				cause,
			});
		}

		return { baseOffset };
	},
});
