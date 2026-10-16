import type {
	KafkaSaslCredentials,
	KafkaTransportConfig,
} from "./types/kafkaClient.js";

export function createKafkaTransport({
	authMode,
	sasl,
}: {
	authMode: "none" | "scram" | "plain";
	sasl?: KafkaSaslCredentials;
}): KafkaTransportConfig {
	if (authMode === "none") return {};
	if (authMode === "scram" || authMode === "plain")
		return createSaslTransport({ sasl });
	throw new Error("Unsupported Kafka authentication mode");
}

function createSaslTransport({
	sasl,
}: {
	sasl?: KafkaSaslCredentials;
}): KafkaTransportConfig {
	if (!sasl?.username.trim() || !sasl.password) {
		throw new Error("SASL authentication requires a username and password");
	}
	const { username, password } = sasl;
	switch (sasl.mechanism) {
		case "plain":
			return { ssl: true, sasl: { mechanism: "plain", username, password } };
		case "scram-sha-512":
			return {
				ssl: true,
				sasl: { mechanism: "scram-sha-512", username, password },
			};
		case "scram-sha-256":
			return {
				ssl: true,
				sasl: { mechanism: "scram-sha-256", username, password },
			};
	}
}
