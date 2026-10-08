import type { KafkaClientConfig } from "../types/kafkaClient.js";

/** librdkafka global properties: one flat map of strings, numbers, booleans and callbacks. */
export type NativeConfig = Record<string, unknown>;

/** How long kafkajs kept retrying a request: the backoff schedule its retry options describe, plus one request. */
export function retryWindowMs({
	retries,
	initialRetryTime,
	maxRetryTime,
	requestTimeout,
}: {
	retries: number;
	initialRetryTime: number;
	maxRetryTime: number;
	requestTimeout: number;
}): number {
	let total = requestTimeout;
	let backoff = initialRetryTime;
	for (let attempt = 0; attempt < retries; attempt++) {
		total += Math.min(backoff, maxRetryTime);
		backoff *= 2;
	}
	return total;
}

function securityProtocolOf({
	ssl,
	sasl,
}: Pick<KafkaClientConfig, "ssl" | "sasl">): string {
	if (sasl) return ssl ? "SASL_SSL" : "SASL_PLAINTEXT";
	return ssl ? "SSL" : "PLAINTEXT";
}

function saslConfigOf({ sasl }: Pick<KafkaClientConfig, "sasl">): NativeConfig {
	if (!sasl) return {};
	if (sasl.mechanism === "oauthbearer") {
		const provider = sasl.oauthBearerProvider;
		async function deliverToken(
			done: (error: Error | null, token?: unknown) => void,
		): Promise<void> {
			try {
				const { value, lifetimeMs } = await provider();
				done(null, {
					tokenValue: value,
					lifetime: lifetimeMs ?? Date.now() + 15 * 60_000,
					principal: "autumn",
				});
			} catch (cause) {
				done(cause instanceof Error ? cause : new Error(String(cause)));
			}
		}
		// The client reads a returned promise as the token itself, so the answer goes through `done` only.
		function refreshToken(
			_config: unknown,
			done: (error: Error | null, token?: unknown) => void,
		): void {
			void deliverToken(done);
		}
		return {
			"sasl.mechanisms": "OAUTHBEARER",
			oauthbearer_token_refresh_cb: refreshToken,
		};
	}
	const mechanism = {
		plain: "PLAIN",
		"scram-sha-256": "SCRAM-SHA-256",
		"scram-sha-512": "SCRAM-SHA-512",
	}[sasl.mechanism];
	return {
		"sasl.mechanisms": mechanism,
		"sasl.username": sasl.username,
		"sasl.password": sasl.password,
	};
}

/** What every client of one Kafka shares: brokers, credentials and the network budget. */
export function nativeClientConfigOf({
	config,
}: {
	config: KafkaClientConfig;
}): NativeConfig {
	return {
		"bootstrap.servers": config.brokers.join(","),
		"client.id": config.clientId,
		"security.protocol": securityProtocolOf(config),
		...saslConfigOf(config),
		"socket.connection.setup.timeout.ms": config.connectionTimeout,
		"socket.timeout.ms": config.requestTimeout,
		"retry.backoff.ms": config.retry.initialRetryTime,
		"retry.backoff.max.ms": config.retry.maxRetryTime,
		"reconnect.backoff.ms": config.retry.initialRetryTime,
		"reconnect.backoff.max.ms": config.retry.maxRetryTime,
		"allow.auto.create.topics": false,
		log_level: 6,
	};
}
