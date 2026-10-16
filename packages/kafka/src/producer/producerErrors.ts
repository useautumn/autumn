import { LIBRDKAFKA_ERROR_CODES } from "@autumn/librdkafka";
import { hasKafkaErrorCode } from "../client/kafkaErrorClassification.js";

/** The broker (or librdkafka on its behalf) cut this producer off: a newer instance holds its id. */
const kafkaFencingErrorCodes: ReadonlySet<number> = new Set([
	LIBRDKAFKA_ERROR_CODES.ERR_INVALID_PRODUCER_EPOCH,
	LIBRDKAFKA_ERROR_CODES.ERR_INVALID_PRODUCER_ID_MAPPING,
	LIBRDKAFKA_ERROR_CODES.ERR_PRODUCER_FENCED,
	LIBRDKAFKA_ERROR_CODES.ERR__FENCED,
]);

export function isKafkaProducerFencingCause({
	cause,
}: {
	cause: unknown;
}): boolean {
	return hasKafkaErrorCode({ cause, codes: kafkaFencingErrorCodes });
}
