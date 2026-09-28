import { isKafkaProducerFencingCause } from "@autumn/kafka";
import { OwnedPartitionProducerFencedError } from "../runtime/runtimeErrors.js";

export function translateKafkaProducerError({
	topic,
	partition,
	cause,
}: {
	topic: string;
	partition: number;
	cause: unknown;
}): unknown {
	return isKafkaProducerFencingCause({ cause })
		? new OwnedPartitionProducerFencedError({ topic, partition, cause })
		: cause;
}
