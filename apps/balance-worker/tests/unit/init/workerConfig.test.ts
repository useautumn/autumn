import { describe, expect, test } from "bun:test";
import { createKafkaClient } from "@autumn/kafka";
import type { KafkaBalanceWorkerTimings } from "../../../src/init/types/partitionRuntimeFactory.js";
import {
	createWorkerConsumerConfig,
	workerConsumerGroupIdOf,
} from "../../../src/init/workerConfig.js";

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
			retry: {
				retries: 4,
				initialRetryTime: 100,
				maxRetryTime: 2_000,
			},
		});
	});

	test("speaks KIP-848 with the broker's range assignor, so partition n of every topic lands on one worker", () => {
		expect(
			createWorkerConsumerConfig({
				groupId: "balance-worker-staging",
				timings,
			}),
		).toEqual({
			groupId: "balance-worker-staging",
			groupProtocol: "consumer",
			remoteAssignor: "range",
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

	test("a fetch wait longer than the heartbeat interval is fine: librdkafka heartbeats on its own thread", () => {
		expect(() =>
			createWorkerConsumerConfig({
				groupId: "balance-worker-staging",
				timings: {
					...timings,
					fetchMaxWaitTimeMs: timings.heartbeatIntervalMs + 1,
				},
			}),
		).not.toThrow();
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

describe("the worker's consumer group", () => {
	const base = { BALANCE_WORKER_GROUP_ID: "tf-balance-staging-workers" };
	// A classic group whose members advertised the load-aware assigner's metadata cannot be converted online to KIP-848.
	test("off ECS it is the deployment's KIP-848 group, never the classic group kafkajs workers joined", () => {
		expect(workerConsumerGroupIdOf({ env: base, fleetId: null })).toBe(
			"tf-balance-staging-workers-kip848",
		);
	});
	test("on ECS it carries the fleet id, so the two Flightcontrol fleets never share a group", () => {
		expect(workerConsumerGroupIdOf({ env: base, fleetId: "1a2b3c4d" })).toBe(
			"tf-balance-staging-workers-kip848-1a2b3c4d",
		);
	});
});
