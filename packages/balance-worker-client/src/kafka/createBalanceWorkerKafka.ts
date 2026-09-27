import { createKafkaClient, createKafkaTransport } from "@autumn/kafka";
import { Kafka } from "kafkajs";
import type {
	BalanceWorkerKafka,
	BalanceWorkerKafkaConfig,
} from "./types/kafkaBalanceWorkerClient.js";

/** Builds the connection; nothing connects until the ownership reader starts or the first command is queued. */
export function createBalanceWorkerKafka({
	clientId,
	brokers,
	authMode,
	region,
}: BalanceWorkerKafkaConfig): BalanceWorkerKafka {
	return new Kafka(
		createKafkaClient({
			clientId,
			brokers,
			transport: createKafkaTransport({ authMode, region }),
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
