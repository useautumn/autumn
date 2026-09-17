import { describe, expect, test } from "bun:test";
import { parseTrackCommand } from "@autumn/balance-engine";
import type { KafkaProducerClient } from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import { createPartitionRuntimeFactory } from "../../../../src/init/construction/createPartitionRuntimeFactory.js";
import type { PartitionRuntimeFactoryConfig } from "../../../../src/init/types/partitionRuntimeFactory.js";
import type {
	PartitionOutcomeFollowerPort,
	PartitionRuntime,
} from "../../../../src/runtime/types/partitionRuntime.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../../fixtures/catalog.js";
import { restoreCustomerStates } from "../../../fixtures/mutations.js";
import {
	closeStoreFixture,
	createState,
	createStoreFixture,
	identity,
	topic,
} from "../../kafka/kafka-test-fixtures.js";

const config: PartitionRuntimeFactoryConfig = {
	deploymentEnvironment: "staging",
	ownership: { topic: "ownership", endpoint: "http://worker.test" },
	checkpointRestoreLimits: {
		maxSerializedBytes: 1_000_000,
		maxStates: 1_000,
		maxReceipts: 10_000,
	},
	checkpointRetryPolicy: {
		maxAttempts: 3,
		initialBackoffMs: 10,
		maxBackoffMs: 100,
	},
	writerLimits: {
		maxBatchSize: 100,
		maxPendingCommands: 1_000,
		maxPendingCommandsPerCustomer: 100,
	},
	trackReceiptRetentionMs: 86_400_000,
	producerLimits: {
		transactionTimeoutMs: 15_000,
		retryCount: 3,
		initialRetryTimeMs: 100,
		maxRetryTimeMs: 2_000,
	},
	timings: {
		fetchMaxWaitTimeMs: 250,
		healthRefreshIntervalMs: 5_000,
		heartbeatIntervalMs: 3_000,
		recoveryDrainTimeoutMs: 5_000,
		rebalanceTimeoutMs: 60_000,
		sessionTimeoutMs: 30_000,
	},
};

describe("Kafka owned partition runtime factory", () => {
	test.concurrent(
		"logs Kafka commit and SQLite apply after each phase completes",
		async () => {
			const fixture = createStoreFixture();
			const commitStarted = Promise.withResolvers<void>();
			const releaseCommit = Promise.withResolvers<void>();
			const logs: unknown[][] = [];
			let runtime: PartitionRuntime | undefined;
			function record(...args: unknown[]): void {
				logs.push(args);
			}
			try {
				restoreCustomerStates({
					store: fixture.store,
					topic,
					partition: 0,
					states: [createState()],
				});
				const producer: KafkaProducerClient = {
					connect: async () => {},
					disconnect: async () => {},
					transaction: async () => ({
						send: async () => [
							{ topicName: topic, partition: 0, errorCode: 0, baseOffset: "0" },
						],
						commit: async () => {
							commitStarted.resolve();
							await releaseCommit.promise;
						},
						abort: async () => {},
					}),
				};
				const factory = createPartitionRuntimeFactory({
					ctx: {
						kafka: { producer: () => producer },
						stateStore: fixture.store,
						db: createSyntheticWorkerDb(),
						catalogCache: createTestCatalogCache(),
						ownershipOffsets: { fetchTopicOffsets: async () => [] },
						checkpointSource: { latest: async () => null },
						partitionResolver: { partitionForIdentity: () => 0 },
						logger: { info: record, warn: record },
					},
					config,
				});
				runtime = factory({
					topic,
					partition: 0,
					follower: {
						readLogRange: async () => ({
							logStartOffset: 0n,
							logEndOffset: 0n,
						}),
						startAndCatchUp: async () => {},
						readProgress: () => ({ consumedNextOffset: 0n, highWatermark: 0n }),
						stop: async () => {},
					},
				}).runtime;
				await runtime.start();
				const command = parseTrackCommand({
					input: {
						schemaVersion: 1,
						type: "track",
						commandId: "private_command",
						requestId: "private_request",
						identity,
						featureId: "messages",
						value: 5,
						overageBehavior: "reject",
						properties: null,
						occurredAt: 1_700_000_000_000,
					},
				});
				const pending = runtime.process((processor) =>
					processor.track({ command }),
				);
				await commitStarted.promise;
				expect(logs).toEqual([]);
				expect(fixture.store.readState({ identity })?.revision).toBe(0);
				releaseCommit.resolve();
				await expect(pending).resolves.toMatchObject({
					kind: "new",
					mutation: { result: { status: "applied" } },
				});
				expect(logs).toHaveLength(2);
				for (const [index, phase, result] of [
					[0, "kafka_commit", "committed"],
					[1, "sqlite_apply", "applied"],
				] as const) {
					expect(logs[index]?.[0]).toMatchObject({
						event: "balance_worker.commit",
						workerDeployment: "staging",
						workerEndpoint: "http://worker.test",
						topic,
						partition: 0,
						phase,
						result,
						batchSize: 1,
						baseOffset: "0",
						durationMs: expect.any(Number),
					});
				}
				expect(fixture.store.readState({ identity })?.revision).toBe(1);
				await expect(
					runtime.process((processor) => processor.track({ command })),
				).resolves.toMatchObject({ kind: "duplicate" });
				expect(logs).toHaveLength(2);
				expect(JSON.stringify(logs)).not.toContain("private_command");
				expect(JSON.stringify(logs)).not.toContain(identity.customerId);
			} finally {
				releaseCommit.resolve();
				await runtime?.stop();
				closeStoreFixture(fixture);
			}
		},
	);

	test("rejects invalid receipt retention before accepting assignments", () => {
		const fixture = createStoreFixture();
		try {
			expect(() =>
				createPartitionRuntimeFactory({
					ctx: {
						kafka: { producer: () => ({}) as KafkaProducerClient },
						stateStore: fixture.store,
						db: createSyntheticWorkerDb(),
						catalogCache: createTestCatalogCache(),
						ownershipOffsets: { fetchTopicOffsets: async () => [] },
						checkpointSource: { latest: async () => null },
						partitionResolver: { partitionForIdentity: () => 0 },
					},
					config: { ...config, trackReceiptRetentionMs: 0 },
				}),
			).toThrow("trackReceiptRetentionMs must be a positive safe integer");
		} finally {
			closeStoreFixture(fixture);
		}
	});

	test("creates each assigned runtime with its partition-scoped producer", () => {
		const fixture = createStoreFixture();
		try {
			const producerConfigs: ProducerConfig[] = [];
			const producer = {} as KafkaProducerClient;
			const createRuntime = createPartitionRuntimeFactory({
				ctx: {
					kafka: {
						producer: (options) => {
							producerConfigs.push(options);
							return producer;
						},
					},
					stateStore: fixture.store,
					db: createSyntheticWorkerDb(),
					catalogCache: createTestCatalogCache(),
					ownershipOffsets: { fetchTopicOffsets: async () => [] },
					checkpointSource: { latest: async () => null },
					partitionResolver: { partitionForIdentity: () => 0 },
				},
				config,
			});
			const follower = {} as PartitionOutcomeFollowerPort;
			createRuntime({ topic, partition: 0, follower });
			createRuntime({ topic, partition: 1, follower });
			expect(
				producerConfigs.map(({ transactionalId }) => transactionalId),
			).toEqual([
				"autumn-balance-worker:staging:metering-events-v1:0",
				"autumn-balance-worker:staging:metering-events-v1:1",
			]);
		} finally {
			closeStoreFixture(fixture);
		}
	});
});
