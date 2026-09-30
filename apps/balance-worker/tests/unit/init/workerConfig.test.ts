import { describe, expect, test } from "bun:test";
import { coPartitionedAssigner, createKafkaClient } from "@autumn/kafka";
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
			logCreator: expect.any(Function),
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
			partitionAssigners: [coPartitionedAssigner],
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

	test("rejects a fetch wait longer than the heartbeat interval", () => {
		expect(() =>
			createWorkerConsumerConfig({
				groupId: "balance-worker-staging",
				timings: {
					...timings,
					fetchMaxWaitTimeMs: timings.heartbeatIntervalMs + 1,
				},
			}),
		).toThrow("fetchMaxWaitTimeMs");
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

test("a worker that reports partition load gets the load-aware assigner", () => {
	const config = createWorkerConsumerConfig({
		groupId: "balance-worker-staging",
		timings,
		partitionLoad: { snapshot: () => new Map() },
	});
	const [assigner, fallback] = config.partitionAssigners ?? [];
	expect(assigner).toBeDefined();
	expect(assigner).not.toBe(coPartitionedAssigner);
	// Still advertised, so old and new workers can share a group mid-rollout.
	expect(fallback).toBe(coPartitionedAssigner);
	expect(
		assigner?.({
			cluster: {} as never,
			groupId: "balance-worker-staging",
			logger: {} as never,
		}).name,
	).toBe("LoadAwareCoPartitionedAssigner");
});

describe("the worker's consumer group", () => {
	const base = { BALANCE_WORKER_GROUP_ID: "tf-balance-staging-workers" };
	test("off ECS it is the deployment's base group: local, tests and a fail-open boot are unchanged", () => {
		expect(workerConsumerGroupIdOf({ env: base, fleetId: null })).toBe(
			"tf-balance-staging-workers",
		);
	});
	test("on ECS it carries the fleet id, so the two Flightcontrol fleets never share a group", () => {
		expect(workerConsumerGroupIdOf({ env: base, fleetId: "1a2b3c4d" })).toBe(
			"tf-balance-staging-workers-1a2b3c4d",
		);
	});
});
