import { LIBRDKAFKA_ERROR_CODES } from "@autumn/librdkafka";
import { hasKafkaErrorCode } from "../client/kafkaErrorClassification.js";
import { KafkaConsumerNotRunningError } from "../client/librdkafka/consumer/runnerErrors.js";

export class KafkaPartitionOffsetsNotFoundError extends Error {
	constructor({ topic, partition }: { topic: string; partition: number }) {
		super(`Kafka partition offsets not found for ${topic}[${partition}]`);
		this.name = "KafkaPartitionOffsetsNotFoundError";
	}
}

/** Pause, resume or seek on a consumer whose group is gone: it was stopped or crashed. The partition is
 *  being reassigned, so there is nothing left to steer and the refusal is not the partition's failure. */
export function isConsumerGroupGoneError({
	cause,
}: {
	cause: unknown;
}): boolean {
	return cause instanceof KafkaConsumerNotRunningError;
}

const ACCESS_REFUSAL_CODES: ReadonlySet<number> = new Set([
	LIBRDKAFKA_ERROR_CODES.ERR_TOPIC_AUTHORIZATION_FAILED,
	LIBRDKAFKA_ERROR_CODES.ERR_GROUP_AUTHORIZATION_FAILED,
	LIBRDKAFKA_ERROR_CODES.ERR_CLUSTER_AUTHORIZATION_FAILED,
	LIBRDKAFKA_ERROR_CODES.ERR_TRANSACTIONAL_ID_AUTHORIZATION_FAILED,
	LIBRDKAFKA_ERROR_CODES.ERR_SASL_AUTHENTICATION_FAILED,
	LIBRDKAFKA_ERROR_CODES.ERR__AUTHENTICATION,
]);

/** The broker refused this client's identity: an authorization verdict on a group, topic or the
 *  cluster, or a failed SASL authentication. A verdict is the broker's to change: prod has refused a
 *  healthy fleet and taken it back within minutes, with no policy or role changed in between. */
export function isKafkaAccessRefusal({ cause }: { cause: unknown }): boolean {
	return hasKafkaErrorCode({ cause, codes: ACCESS_REFUSAL_CODES });
}
