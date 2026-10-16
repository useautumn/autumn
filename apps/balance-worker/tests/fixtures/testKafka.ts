import { createKafka, createKafkaClient, type Kafka } from "@autumn/kafka";

/** A plaintext client against the test broker, with the bounded limits every integration test used. */
export function createTestKafka({
	clientId,
	brokers,
}: {
	clientId: string;
	brokers: string[];
}): Kafka {
	return createKafka(
		createKafkaClient({
			clientId,
			brokers,
			transport: {},
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	);
}
