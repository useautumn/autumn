/** Thrown, not skipped: the record stays unresolved and Kafka redelivers it once the partition is admitted again. */
export class CommandPartitionUnavailableError extends Error {
	readonly retriable = true;
	readonly topic: string;
	readonly partition: number;

	constructor({ topic, partition }: { topic: string; partition: number }) {
		super(`No admitted runtime for ${topic}[${partition}] to consume commands`);
		this.name = "CommandPartitionUnavailableError";
		this.topic = topic;
		this.partition = partition;
	}
}
