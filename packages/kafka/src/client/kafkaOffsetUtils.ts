import type { RecordMetadata } from "kafkajs";
import { InvalidKafkaOffsetError } from "./kafkaErrors.js";

export function parseKafkaOffset({ offset }: { offset: string }): bigint {
	let parsedOffset: bigint;
	try {
		parsedOffset = BigInt(offset);
	} catch {
		throw new InvalidKafkaOffsetError({ offset });
	}
	if (parsedOffset < 0n) throw new InvalidKafkaOffsetError({ offset });
	return parsedOffset;
}

export function metadataToBaseOffset({
	metadata,
	topic,
	partition,
}: {
	metadata: RecordMetadata[];
	topic: string;
	partition: number;
}): bigint {
	if (metadata.length !== 1) {
		throw new Error("Expected Kafka metadata for one topic partition");
	}

	const recordMetadata = metadata[0];
	if (
		!recordMetadata ||
		recordMetadata.topicName !== topic ||
		recordMetadata.partition !== partition ||
		recordMetadata.errorCode !== 0
	) {
		throw new Error(
			"Kafka metadata did not match the appended topic partition",
		);
	}

	const offset = recordMetadata.baseOffset ?? recordMetadata.offset;
	if (typeof offset !== "string" || !/^(0|[1-9]\d*)$/.test(offset)) {
		throw new Error("Kafka metadata did not contain a valid base offset");
	}
	return BigInt(offset);
}
