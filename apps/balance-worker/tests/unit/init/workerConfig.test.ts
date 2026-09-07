import { describe, expect, test } from "bun:test";
import { createKafkaClient } from "@autumn/kafka";
import type { KafkaBalanceWorkerTimings } from "../../../src/init/types/partitionRuntimeFactory.js";
import { createWorkerConsumerConfig } from "../../../src/init/workerConfig.js";

const timings = {
	fetchMaxWaitTimeMs: 250,
	healthRefreshIntervalMs: 5_000,
	heartbeatIntervalMs: 3_000,
	recoveryDrainTimeoutMs: 5_000,
	rebalanceTimeoutMs: 60_000,
	sessionTimeoutMs: 30_000,
} satisfies KafkaBalanceWorkerTimings;

describe("Kafka balance worker config", () => {
	test("bounds connection and request retries", () => {
		const config = createKafkaClient({
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
			createWorkerConsumerConfig({
				groupId: "balance-worker-staging",
				timings,
			}),
		).toEqual({
			groupId: "balance-worker-staging",
			readUncommitted: false,
			allowAutoTopicCreation: false,
			maxWaitTimeInMs: 250,
			heartbeatInterval: 3_000,
			rebalanceTimeout: 60_000,
			sessionTimeout: 30_000,
		});
	});

	test("rejects a recovery drain that can outlast the rebalance", () => {
		expect(() =>
			createWorkerConsumerConfig({
				groupId: "balance-worker-staging",
				timings: {
					...timings,
					recoveryDrainTimeoutMs: timings.rebalanceTimeoutMs,
				},
			}),
		).toThrow("recoveryDrainTimeoutMs");
	});

	test("rejects a disabled idle health refresh", () => {
		expect(() =>
			createWorkerConsumerConfig({
				groupId: "balance-worker-staging",
				timings: { ...timings, healthRefreshIntervalMs: 0 },
			}),
		).toThrow("healthRefreshIntervalMs");
	});

	test("rejects a heartbeat that cannot fit inside the session", () => {
		expect(() =>
			createWorkerConsumerConfig({
				groupId: "balance-worker-staging",
				timings: {
					...timings,
					heartbeatIntervalMs: timings.sessionTimeoutMs,
				},
			}),
		).toThrow("heartbeatIntervalMs");
	});

	test("rejects a session that can outlast the rebalance", () => {
		expect(() =>
			createWorkerConsumerConfig({
				groupId: "balance-worker-staging",
				timings: {
					...timings,
					sessionTimeoutMs: timings.rebalanceTimeoutMs + 1,
				},
			}),
		).toThrow("sessionTimeoutMs");
	});

	test("rejects unbounded client retry settings", () => {
		expect(() =>
			createKafkaClient({
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
