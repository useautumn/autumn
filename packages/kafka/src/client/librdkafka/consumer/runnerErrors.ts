/** Thrown by `heartbeat()` once the batch's partition was revoked or the consumer restarted under it. */
export class KafkaConsumerLeaseLostError extends Error {
	readonly topic: string;
	readonly partition: number;

	constructor({ topic, partition }: { topic: string; partition: number }) {
		super(`Kafka assignment of ${topic}[${partition}] was lost mid-batch`);
		this.name = "KafkaConsumerLeaseLostError";
		this.topic = topic;
		this.partition = partition;
	}
}

/** Steering (seek, pause, resume) a consumer that has no group: never started, stopped or crashed. */
export class KafkaConsumerNotRunningError extends Error {
	constructor({ operation }: { operation: string }) {
		super(`Consumer group was not initialized: cannot ${operation}`);
		this.name = "KafkaConsumerNotRunningError";
	}
}
