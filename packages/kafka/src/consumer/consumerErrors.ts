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
	return findCause({ cause, matches: isAccessRefusalError }) !== undefined;
}

function isAccessRefusalError(error: object): boolean {
	if (error instanceof KafkaJSProtocolError)
		return ACCESS_REFUSAL_TYPES.has(error.type);
	if (!(error instanceof Error)) return false;
	return error.name === "KafkaJSSASLAuthenticationError";
}

const GROUP_CHURN_TYPES = new Set([
	"ILLEGAL_GENERATION",
	"REBALANCE_IN_PROGRESS",
	"UNKNOWN_MEMBER_ID",
]);

/** The group moved on without this member: kafkajs marks these non-retriable, and wrapped by
 *  `consumer.commitOffsets` they crash the consumer instead of rejoining it. */
export function groupChurnCauseOf({
	cause,
}: {
	cause: unknown;
}): KafkaJSProtocolError | undefined {
	const found = findCause({ cause, matches: isGroupChurnError });
	return found instanceof KafkaJSProtocolError ? found : undefined;
}

export function isKafkaGroupChurn({ cause }: { cause: unknown }): boolean {
	return groupChurnCauseOf({ cause }) !== undefined;
}

function isGroupChurnError(error: object): boolean {
	return (
		error instanceof KafkaJSProtocolError && GROUP_CHURN_TYPES.has(error.type)
	);
}

function findCause({
	cause,
	matches,
}: {
	cause: unknown;
	matches: (error: object) => boolean;
}): object | undefined {
	const seen = new Set<unknown>();
	let current = cause;
	while (
		typeof current === "object" &&
		current !== null &&
		!seen.has(current)
	) {
		if (matches(current)) return current;
		seen.add(current);
		if (!("cause" in current)) return undefined;
		current = current.cause;
	}
	return undefined;
}
