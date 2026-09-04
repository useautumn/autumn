import type { OwnedPartitionRuntimeStatus } from "../runtime/ownedPartitionErrors.js";

export type OwnedPartitionHealth = {
	topic: string;
	partition: number;
	status: OwnedPartitionRuntimeStatus;
	localNextOffset: bigint | null;
	consumedNextOffset: bigint | null;
	highWatermark: bigint | null;
	lag: bigint | null;
	failureReason: string | null;
};

export type OwnedPartitionFollowerProgress = Pick<
	OwnedPartitionHealth,
	"consumedNextOffset" | "highWatermark"
>;

type OwnedPartitionHealthInput = Omit<OwnedPartitionHealth, "lag">;

const assertOffset = ({
	name,
	offset,
}: {
	name: string;
	offset: bigint | null;
}): void => {
	if (offset !== null && offset < 0n) {
		throw new RangeError(`${name} cannot be negative`);
	}
};

export const ownedPartitionHealthOf = ({
	topic,
	partition,
	status,
	localNextOffset,
	consumedNextOffset,
	highWatermark,
	failureReason,
}: OwnedPartitionHealthInput): OwnedPartitionHealth => {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	assertOffset({ name: "Local next offset", offset: localNextOffset });
	assertOffset({ name: "Consumed next offset", offset: consumedNextOffset });
	assertOffset({ name: "High watermark", offset: highWatermark });

	const freshestNextOffset =
		localNextOffset === null
			? (consumedNextOffset ?? 0n)
			: consumedNextOffset === null || localNextOffset > consumedNextOffset
				? localNextOffset
				: consumedNextOffset;
	const lag =
		highWatermark === null
			? null
			: highWatermark > freshestNextOffset
				? highWatermark - freshestNextOffset
				: 0n;

	return {
		topic,
		partition,
		status,
		localNextOffset,
		consumedNextOffset,
		highWatermark,
		lag,
		failureReason,
	};
};

export const ownedPartitionFailureReasonOf = ({
	cause,
}: {
	cause: unknown;
}): string => {
	const seen = new Set<unknown>();
	let currentCause = cause;
	let rootError: Error | null = null;
	while (
		typeof currentCause === "object" &&
		currentCause !== null &&
		!seen.has(currentCause)
	) {
		seen.add(currentCause);
		const details = currentCause as { cause?: unknown; reason?: unknown };
		if (typeof details.reason === "string" && details.reason.length > 0) {
			return details.reason;
		}
		if (currentCause instanceof Error) rootError = currentCause;
		if (!("cause" in details)) break;
		currentCause = details.cause;
	}
	if (rootError) return `${rootError.name}: ${rootError.message}`;
	return "unknown_failure";
};
