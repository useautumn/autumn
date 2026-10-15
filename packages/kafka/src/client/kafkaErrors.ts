export class KafkaBatchNotCommittedError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Kafka batch was not committed", { cause });
		this.name = "KafkaBatchNotCommittedError";
	}
}

export class KafkaTransactionStateUnknownError extends Error {
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
		super("Kafka transaction state is unknown", { cause });
		this.name = "KafkaTransactionStateUnknownError";
		this.failureStage = failureStage;
		this.abortCause = abortCause;
	}
}

export class InvalidKafkaOffsetError extends Error {
	readonly retriable = false;
	readonly offset: string;

	constructor({ offset }: { offset: string }) {
		super(`Invalid Kafka record offset: ${offset}`);
		this.name = "InvalidKafkaOffsetError";
		this.offset = offset;
	}
}

export class KafkaTopicPartitionsUnavailableError extends Error {
	readonly topic: string;

	constructor({ topic, cause }: { topic: string; cause: unknown }) {
		super(`Kafka reported no partitions for ${topic} before the deadline`, {
			cause,
		});
		this.name = "KafkaTopicPartitionsUnavailableError";
		this.topic = topic;
	}
}

/** Some records of one send were written and others were not; no part of it may be read as refused.
 *  The failure is kept off `cause` so the error never classifies as the broker's refusal. */
export class KafkaPartialDeliveryError extends Error {
	readonly delivered: number;
	readonly total: number;
	readonly failure: unknown;

	constructor({
		delivered,
		total,
		failure,
	}: {
		delivered: number;
		total: number;
		failure: unknown;
	}) {
		super(
			`Kafka wrote ${delivered} of ${total} records of one send: ${String(failure)}`,
		);
		this.name = "KafkaPartialDeliveryError";
		this.delivered = delivered;
		this.total = total;
		this.failure = failure;
	}
}
