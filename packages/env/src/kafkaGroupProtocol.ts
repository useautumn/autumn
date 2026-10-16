import { isStagingEnv } from "./staging.js";

const GROUP_PROTOCOLS = ["consumer", "classic"] as const;
type KafkaGroupProtocol = (typeof GROUP_PROTOCOLS)[number];

/**
 * `consumer` (KIP-848) in production only; staging's Redpanda and older local Kafka lack ConsumerGroupHeartbeat,
 * so every other environment defaults to `classic`. An explicit KAFKA_GROUP_PROTOCOL always wins.
 */
export function createKafkaGroupProtocolEnv({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}) {
	const protocol =
		runtimeEnv.KAFKA_GROUP_PROTOCOL?.trim() ||
		(runtimeEnv.NODE_ENV === "production" && !isStagingEnv({ runtimeEnv })
			? "consumer"
			: "classic");
	if (!isKafkaGroupProtocol(protocol))
		throw new Error("KAFKA_GROUP_PROTOCOL must be consumer or classic");
	return { KAFKA_GROUP_PROTOCOL: protocol } as const;
}

function isKafkaGroupProtocol(value: string): value is KafkaGroupProtocol {
	return (GROUP_PROTOCOLS as readonly string[]).includes(value);
}
