import {
	createKafka,
	createKafkaClient,
	createKafkaTransport,
} from "@autumn/kafka";
import type {
	BalanceWorkerKafka,
	BalanceWorkerKafkaConfig,
} from "./types/kafkaBalanceWorkerClient.js";

/** Builds the connection; nothing connects until the ownership reader starts or the first command is queued. */
export function createBalanceWorkerKafka({
	clientId,
	brokers,
	authMode,
	sasl,
}: BalanceWorkerKafkaConfig): BalanceWorkerKafka {
	return createKafka(
		createKafkaClient({
			clientId,
			brokers,
			transport: createKafkaTransport({ authMode, sasl }),
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	);
}
