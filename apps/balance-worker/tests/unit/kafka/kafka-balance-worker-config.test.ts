import { describe, expect, test } from "bun:test";
import {
	balanceWorkerConsumerConfigOf,
	balanceWorkerKafkaConfigOf,
} from "../../../src/kafka/kafkaBalanceWorkerConfig.js";

describe("Kafka balance worker config", () => {
	test("bounds connection and request retries", () => {
		const config = balanceWorkerKafkaConfigOf({
			clientId: "balance-worker-staging",
			brokers: ["broker-1:9098", "broker-2:9098"],
			transport: { ssl: true },
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 4,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 2_000,
			},
		});

		expect(config).toEqual({
			clientId: "balance-worker-staging",
			brokers: ["broker-1:9098", "broker-2:9098"],
			ssl: true,
			connectionTimeout: 3_000,
			requestTimeout: 10_000,
			enforceRequestTimeout: true,
			retry: {
				retries: 4,
				initialRetryTime: 100,
				maxRetryTime: 2_000,
			},
		});
	});

	test("makes committed records the consumer visibility boundary", () => {
		expect(
			balanceWorkerConsumerConfigOf({
				groupId: "balance-worker-staging",
				fetchMaxWaitTimeMs: 250,
			}),
		).toEqual({
			groupId: "balance-worker-staging",
			readUncommitted: false,
			allowAutoTopicCreation: false,
			maxWaitTimeInMs: 250,
		});
	});

	test("rejects unbounded client retry settings", () => {
		expect(() =>
			balanceWorkerKafkaConfigOf({
				clientId: "balance-worker-staging",
				brokers: ["broker-1:9098"],
				transport: {},
				limits: {
					connectionTimeoutMs: 3_000,
					requestTimeoutMs: 10_000,
					retryCount: 100,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 2_000,
				},
			}),
		).toThrow("retryCount");
	});
});
