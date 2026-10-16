const GROUP_PROTOCOLS = ["consumer", "classic"] as const;
type KafkaGroupProtocol = (typeof GROUP_PROTOCOLS)[number];

/**
 * Which group protocol every consumer group speaks: `consumer` (KIP-848, the broker assigns) unless the cluster
 * cannot, in which case `classic` falls back to librdkafka's client-side `range`.
 */
export function createKafkaGroupProtocolEnv({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}) {
	const protocol = runtimeEnv.KAFKA_GROUP_PROTOCOL?.trim() || "consumer";
	if (!isKafkaGroupProtocol(protocol))
		throw new Error("KAFKA_GROUP_PROTOCOL must be consumer or classic");
	return { KAFKA_GROUP_PROTOCOL: protocol } as const;
}

function isKafkaGroupProtocol(value: string): value is KafkaGroupProtocol {
	return (GROUP_PROTOCOLS as readonly string[]).includes(value);
}
