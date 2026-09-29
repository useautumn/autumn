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
