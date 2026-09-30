import { KafkaJSNonRetriableError, KafkaJSProtocolError } from "kafkajs";

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

const ACCESS_REFUSAL_TYPES = new Set([
	"TOPIC_AUTHORIZATION_FAILED",
	"GROUP_AUTHORIZATION_FAILED",
	"CLUSTER_AUTHORIZATION_FAILED",
	"TRANSACTIONAL_ID_AUTHORIZATION_FAILED",
	"SASL_AUTHENTICATION_FAILED",
]);

/** The broker refused this client's identity: an authorization verdict on a group, topic or the
 *  cluster, or a failed SASL authentication. kafkajs marks these non-retriable and gives up the
 *  group for good, but a verdict is the broker's to change: prod has refused a healthy fleet
 *  twice and taken it back within minutes, with no policy or role changed in between. */
export function isKafkaAccessRefusal({ cause }: { cause: unknown }): boolean {
	const seen = new Set<unknown>();
	let current = cause;
	while (
		typeof current === "object" &&
		current !== null &&
		!seen.has(current)
	) {
		if (isAccessRefusalError(current)) return true;
		seen.add(current);
		if (!("cause" in current)) return false;
		current = current.cause;
	}
	return false;
}

function isAccessRefusalError(error: object): boolean {
	if (error instanceof KafkaJSProtocolError)
		return ACCESS_REFUSAL_TYPES.has(error.type);
	if (!(error instanceof Error)) return false;
	return error.name === "KafkaJSSASLAuthenticationError";
}
