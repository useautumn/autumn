import { KafkaJSNonRetriableError } from "kafkajs";

export class KafkaPartitionOffsetsNotFoundError extends Error {
	constructor({ topic, partition }: { topic: string; partition: number }) {
		super(`Kafka partition offsets not found for ${topic}[${partition}]`);
		this.name = "KafkaPartitionOffsetsNotFoundError";
	}
}

const CONSUMER_GROUP_GONE_MESSAGE = "Consumer group was not initialized";

/** kafkajs refuses to pause, resume or seek once its consumer group is gone: the runner crashed and is
 *  rejoining, or the consumer was stopped. Either way the partition is being reassigned and there is
 *  nothing left to steer, so the refusal is not a failure of the partition being steered. */
export function isConsumerGroupGoneError({
	cause,
}: {
	cause: unknown;
}): boolean {
	return (
		cause instanceof KafkaJSNonRetriableError &&
		cause.message.includes(CONSUMER_GROUP_GONE_MESSAGE)
	);
}
