import { describe, expect, test } from "bun:test";
import type { ProducerConfig } from "kafkajs";
import { createKafkaOwnedPartitionRuntimeFactory } from "../../../src/kafka/kafkaOwnedPartitionRuntimeFactory.js";
import type { KafkaPartitionOutcomeFollower } from "../../../src/kafka/kafkaPartitionOutcomeFollower.js";
import type { OwnedPartitionProducerPort } from "../../../src/runtime/ownedPartitionRuntime.js";
import {
	closeStoreFixture,
	createStoreFixture,
	topic,
} from "./kafka-test-fixtures.js";

describe("Kafka owned partition runtime factory", () => {
	test("creates each assigned runtime with its partition-scoped producer", () => {
		const fixture = createStoreFixture();
		try {
			const producerConfigs: ProducerConfig[] = [];
			const producer = {} as OwnedPartitionProducerPort;
			const createRuntime = createKafkaOwnedPartitionRuntimeFactory({
				kafka: {
					producer: (config) => {
						producerConfigs.push(config);
						return producer;
					},
				},
				deploymentEnvironment: "staging",
				stateStore: fixture.store,
				partitionResolver: { partitionForIdentity: () => 0 },
				writerLimits: {
					maxBatchSize: 100,
					maxPendingCommands: 1_000,
					maxPendingCommandsPerCustomer: 100,
				},
				producerLimits: {
					transactionTimeoutMs: 15_000,
					retryCount: 3,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 2_000,
				},
				recoveryDrainTimeoutMs: 5_000,
			});
			const follower = {} as KafkaPartitionOutcomeFollower;

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
