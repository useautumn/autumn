import type { KafkaProducerErrorMetadata } from "./types/producer.js";

const kafkaFencingErrorTypes = new Set([
	"INVALID_PRODUCER_EPOCH",
	"INVALID_PRODUCER_ID_MAPPING",
	"PRODUCER_FENCED",
]);
const kafkaFencingErrorCodes = new Set([47, 49, 90]);

export function isKafkaProducerFencingCause({
	cause,
}: {
	cause: unknown;
}): boolean {
	const pendingCauses = [cause];
	const visitedCauses = new Set<unknown>();
	while (pendingCauses.length > 0) {
		const currentCause = pendingCauses.pop();
		if (
			currentCause === null ||
			typeof currentCause !== "object" ||
			visitedCauses.has(currentCause)
		)
			continue;
		visitedCauses.add(currentCause);
		const metadata = currentCause as KafkaProducerErrorMetadata;
		if (
			(typeof metadata.type === "string" &&
				kafkaFencingErrorTypes.has(metadata.type)) ||
			(typeof metadata.code === "number" &&
				kafkaFencingErrorCodes.has(metadata.code))
		)
			return true;
		pendingCauses.push(metadata.cause, metadata.abortCause);
		if (Array.isArray(metadata.errors)) pendingCauses.push(...metadata.errors);
	}
	return false;
}
