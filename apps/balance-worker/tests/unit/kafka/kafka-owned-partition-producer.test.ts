import { describe, expect, test } from "bun:test";
import type { ProducerConfig } from "kafkajs";
import {
	createKafkaOwnedPartitionProducer,
	ownedPartitionTransactionalIdOf,
} from "../../../src/kafka/kafkaOwnedPartitionProducer.js";
import type { OwnedPartitionProducerPort } from "../../../src/runtime/ownedPartitionRuntime.js";

const fakeProducer = {} as OwnedPartitionProducerPort;

describe("Kafka owned partition producer", () => {
	test("uses a stable transactional identity and bounded producer settings", () => {
		let receivedConfig: ProducerConfig | undefined;
		const producer = createKafkaOwnedPartitionProducer({
			kafka: {
				producer: (config) => {
					receivedConfig = config;
					return fakeProducer;
				},
			},
			deploymentEnvironment: "staging/eu-west-1",
			topic: "metering-events-v1",
			partition: 3,
			limits: {
				transactionTimeoutMs: 15_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 2_000,
			},
		});

		expect(producer).toBe(fakeProducer);
		expect(receivedConfig).toEqual({
			transactionalId:
				"autumn-balance-worker:staging%2Feu-west-1:metering-events-v1:3",
			idempotent: true,
			maxInFlightRequests: 1,
			transactionTimeout: 15_000,
			retry: {
				retries: 3,
				initialRetryTime: 100,
				maxRetryTime: 2_000,
			},
		});
	});

	test("changes the transactional identity only when ownership coordinates change", () => {
		const first = ownedPartitionTransactionalIdOf({
			deploymentEnvironment: "staging",
			topic: "metering-events-v1",
			partition: 3,
		});
		const same = ownedPartitionTransactionalIdOf({
			deploymentEnvironment: "staging",
			topic: "metering-events-v1",
			partition: 3,
		});
		const replacementPartition = ownedPartitionTransactionalIdOf({
			deploymentEnvironment: "staging",
			topic: "metering-events-v1",
			partition: 4,
		});

		expect(same).toBe(first);
		expect(replacementPartition).not.toBe(first);
	});

	test("rejects unbounded or invalid producer limits", () => {
		expect(() =>
			createKafkaOwnedPartitionProducer({
				kafka: { producer: () => fakeProducer },
				deploymentEnvironment: "staging",
				topic: "metering-events-v1",
				partition: 0,
				limits: {
					transactionTimeoutMs: 15_000,
					retryCount: Number.MAX_SAFE_INTEGER - 1,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 2_000,
				},
			}),
		).toThrow("retryCount");
	});
});
