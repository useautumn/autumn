import { describe, expect, test } from "bun:test";
import type { KafkaProducerClient } from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import { createPartitionRuntimeFactory } from "../../../../src/init/construction/createPartitionRuntimeFactory.js";
import type { PartitionRuntimeFactoryConfig } from "../../../../src/init/types/partitionRuntimeFactory.js";
import type { PartitionOutcomeFollowerPort } from "../../../../src/runtime/types/partitionRuntime.js";
import {
	closeStoreFixture,
	createStoreFixture,
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
	test("rejects invalid receipt retention before accepting assignments", () => {
		const fixture = createStoreFixture();
		try {
			expect(() =>
				createPartitionRuntimeFactory({
					ctx: {
						kafka: { producer: () => ({}) as KafkaProducerClient },
						stateStore: fixture.store,
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
