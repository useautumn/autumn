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
